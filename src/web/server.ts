import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { WebSocketServer, type WebSocket } from 'ws';
import type { MsqEvents } from '../core/events/types.js';
import { msqEventBus } from '../core/events/index.js';
import { assertWritableDbPath } from '../db/index.js';
import {
  abortPipeline,
  forceResolveGate,
  listRunEvents,
  listRunHistoryForFeature,
  listRunOutput,
  listTaskRunsForRun,
  pausePipeline,
  requestFeatureAbort,
  resolveGate,
  resolveStageRequest,
  resumePipeline,
} from '../db/repo.js';
import { computeRunBreakdown } from '../core/stats.js';
import { resolveRepo } from '../core/repo.js';
import { loadBacklogFromCatalog } from '../core/backlog/load.js';
import { validateBacklogSkills } from '../core/skills/index.js';
import { loadConfig } from '../config/index.js';
import { buildMsqWebState, appendNotification } from './state.js';
import type { RunChangesPayload, WebSocketClientMessage, WebSocketServerMessage } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATIC_DIR = join(__dirname, 'static');

interface HeartbeatWebSocket extends WebSocket {
  isAlive: boolean;
}

interface Client {
  socket: HeartbeatWebSocket;
  authenticated: boolean;
  outputSubscriptions: Set<number>;
  detailSubscriptions: Set<number>;
  historySubscriptions: Set<string>;
  changesSubscriptions: Set<number>;
}

// F34 item 2: git status/diff for a run's working directory. Runs against
// the server's own cwd (the repo msq operates on today, no per-run
// worktrees) — see docs/features/F34-web-run-detail-and-control-polish.md
// item 2 for the accepted limitation (a run's "changes" can include
// unrelated edits made manually to the repo during the run).
//
// GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE (and friends) take priority over
// `cwd`-based repo discovery when present in the environment — which they
// are whenever this process is a descendant of a git hook (e.g. the msq
// server started, however indirectly, under a pre-commit run). Without
// stripping them, `git` here would silently operate on the ancestor
// process's repo/index instead of `cwd`.
const GIT_ENV_OVERRIDE = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);

function runGit(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: GIT_ENV_OVERRIDE,
  });
}

function computeRunChanges(runId: number, cwd: string): RunChangesPayload {
  try {
    runGit(['rev-parse', '--is-inside-work-tree'], cwd);
  } catch {
    return {
      runId,
      branch: null,
      remoteUrl: null,
      files: [],
      notApplicableReason: "No git repository detected for this run's working directory.",
    };
  }

  let branch: string | null = null;
  try {
    branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).trim() || null;
  } catch {
    branch = null;
  }

  let remoteUrl: string | null = null;
  try {
    remoteUrl = runGit(['config', '--get', 'remote.origin.url'], cwd).trim() || null;
  } catch {
    remoteUrl = null;
  }

  let statusOutput = '';
  try {
    statusOutput = runGit(['status', '--porcelain'], cwd);
  } catch {
    statusOutput = '';
  }

  let numstatOutput = '';
  try {
    numstatOutput = runGit(['diff', '--numstat', 'HEAD'], cwd);
  } catch {
    try {
      numstatOutput = runGit(['diff', '--numstat'], cwd);
    } catch {
      numstatOutput = '';
    }
  }

  const statsByPath = new Map<string, { additions: number; deletions: number }>();
  for (const line of numstatOutput.split('\n')) {
    if (!line.trim()) continue;
    const [added, deleted, path] = line.split('\t');
    if (!path) continue;
    statsByPath.set(path, {
      additions: added === '-' ? 0 : Number(added),
      deletions: deleted === '-' ? 0 : Number(deleted),
    });
  }

  const files: RunChangesPayload['files'] = [];
  for (const line of statusOutput.split('\n')) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    const path = line.slice(3).trim();
    const status = code.includes('D') ? 'deleted' : code.includes('A') || code.includes('?') ? 'added' : 'modified';
    const stat = statsByPath.get(path) ?? { additions: 0, deletions: 0 };
    files.push({ path, status, additions: stat.additions, deletions: stat.deletions });
  }

  return { runId, branch, remoteUrl, files, notApplicableReason: null };
}

const BROADCAST_EVENTS: (keyof MsqEvents)[] = [
  'run:start',
  'run:done',
  'run:failed',
  'run:output',
  'tokens:update',
  'gate:created',
  'gate:resolved',
  'stage:request-created',
  'stage:request-resolved',
  'task:started',
  'task:updated',
  'ui:info',
  'ui:notice',
  'budget:alert',
];

export interface RunningWebServer {
  server: Server;
  wss: WebSocketServer;
  url: string;
  close: () => Promise<void>;
}

export function createWebServer(options: {
  host: string;
  port: number;
  auth: 'token' | 'none';
  token: string;
  cwd?: string;
}): RunningWebServer {
  const clients = new Map<HeartbeatWebSocket, Client>();
  let latestState = buildMsqWebState();
  const cwd = options.cwd ?? process.cwd();

  function broadcast(message: WebSocketServerMessage): void {
    const data = JSON.stringify(message);
    for (const client of clients.values()) {
      if (client.authenticated && client.socket.readyState === 1 /* OPEN */) {
        client.socket.send(data);
      }
    }
  }

  function sendTo(client: Client, message: WebSocketServerMessage): void {
    if (client.socket.readyState === 1 /* OPEN */) {
      client.socket.send(JSON.stringify(message));
    }
  }

  function refreshState(): void {
    latestState = buildMsqWebState();
  }

  const eventUnsubscribers = BROADCAST_EVENTS.map((event) =>
    msqEventBus.subscribe(event, (payload) => {
      broadcast({ type: event, payload });
      if (event === 'ui:info' || event === 'ui:notice') {
        const message =
          typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
            ? payload.message
            : '';
        latestState = appendNotification(latestState, {
          id: `${String(Date.now())}-${String(Math.random())}`,
          type: event === 'ui:info' ? 'info' : 'notice',
          message,
          createdAt: new Date().toISOString(),
        });
      }
    }),
  );

  function extractToken(req: IncomingMessage): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    return null;
  }

  function isAuthenticated(req: IncomingMessage): boolean {
    if (options.auth === 'none') return true;
    const token = extractToken(req);
    return token === options.token;
  }

  function readStaticBody(urlPath: string): { body: Buffer; contentType: string } | null {
    try {
      const safe = urlPath.replace(/\.{2,}/g, '').replace(/^\/+/, '');
      if (!safe) return null;
      const filePath = safe === 'index.html' || safe === '' ? join(STATIC_DIR, 'index.html') : join(STATIC_DIR, safe);
      const body = readFileSync(filePath);
      const contentType = safe.endsWith('.js')
        ? 'application/javascript'
        : safe.endsWith('.css')
          ? 'text/css'
          : 'text/html';
      return { body, contentType };
    } catch {
      return null;
    }
  }

  function serveStatic(_req: IncomingMessage, res: ServerResponse, urlPath: string): void {
    const file = readStaticBody(urlPath);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': file.contentType });
    res.end(file.body);
  }

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    try {
      if (pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (pathname === '/api/state') {
        if (!isAuthenticated(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        refreshState();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(latestState));
        return;
      }

      const changesMatch = /^\/api\/runs\/(\d+)\/changes$/.exec(pathname);
      if (changesMatch?.[1]) {
        if (!isAuthenticated(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        const runId = Number(changesMatch[1]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(computeRunChanges(runId, cwd)));
        return;
      }

      if (pathname === '/' || pathname === '/index.html') {
        serveStatic(req, res, 'index.html');
        return;
      }

      if (pathname.startsWith('/static/')) {
        serveStatic(req, res, pathname.slice('/static/'.length));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (rawSocket) => {
    const socket = rawSocket as HeartbeatWebSocket;
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });

    const heartbeat = setInterval(() => {
      if (socket.readyState !== 1 /* OPEN */) return;
      if (!socket.isAlive) {
        socket.terminate();
        clearInterval(heartbeat);
        return;
      }
      socket.isAlive = false;
      socket.ping();
    }, 60_000);

    const client: Client = {
      socket,
      authenticated: options.auth === 'none',
      outputSubscriptions: new Set(),
      detailSubscriptions: new Set(),
      historySubscriptions: new Set(),
      changesSubscriptions: new Set(),
    };
    clients.set(socket, client);

    socket.on('message', (rawData) => {
      let data: string;
      if (Buffer.isBuffer(rawData)) {
        data = rawData.toString('utf8');
      } else if (Array.isArray(rawData)) {
        data = Buffer.concat(rawData).toString('utf8');
      } else if (typeof rawData === 'string') {
        data = rawData;
      } else if (ArrayBuffer.isView(rawData)) {
        data = Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength).toString('utf8');
      } else {
        data = Buffer.from(rawData).toString('utf8');
      }
      let message: WebSocketClientMessage | undefined;
      try {
        message = JSON.parse(data) as WebSocketClientMessage;
      } catch {
        socket.close(1007, 'Invalid JSON');
        return;
      }

      if (message.type === 'auth') {
        if (options.auth === 'none') {
          client.authenticated = true;
          // state:full was already sent on connection for auth=none
          return;
        }
        if (message.token === options.token) {
          client.authenticated = true;
          sendTo(client, { type: 'state:full', payload: buildMsqWebState() });
        } else {
          socket.close(1008, 'Invalid token');
        }
        return;
      }

      if (!client.authenticated) {
        socket.close(1008, 'Not authenticated');
        return;
      }

      handleClientMessage(message, client, cwd);
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(socket);
    });

    // If auth is disabled, send full state immediately
    if (options.auth === 'none') {
      sendTo(client, { type: 'state:full', payload: buildMsqWebState() });
    }

    // Allow a window for auth before closing unauthenticated sockets
    if (options.auth === 'token') {
      const timer = setTimeout(() => {
        if (!client.authenticated && socket.readyState === 1 /* OPEN */) {
          socket.close(1008, 'Authentication required');
        }
      }, 60_000);
      timer.unref();
    }
  });

  function sendRunDetail(client: Client, runId: number): void {
    try {
      const taskRuns = listTaskRunsForRun(runId);
      const runEvents = listRunEvents(runId);
      const startedAt = runEvents.find((event) => event.event === 'start')?.createdAt ?? null;
      const endedAt = runEvents.find((event) => event.event === 'done' || event.event === 'failed')?.createdAt ?? null;
      const breakdown = startedAt ? computeRunBreakdown(runEvents, startedAt, endedAt) : null;
      sendTo(client, { type: 'run:detail', payload: { runId, taskRuns, breakdown } });
    } catch {
      // DB unavailable — skip this update
    }
  }

  function handleClientMessage(
    message: Exclude<WebSocketClientMessage, { type: 'auth' }>,
    client: Client,
    featureCwd: string,
  ): void {
    switch (message.type) {
      case 'action:startFeature': {
        startFeature(message.featureId, featureCwd, message.overrides);
        break;
      }
      case 'action:pausePipeline': {
        pausePipeline(message.pipelineId);
        break;
      }
      case 'action:resumePipeline': {
        resumePipeline(message.pipelineId);
        break;
      }
      case 'action:abortPipeline': {
        abortPipeline(message.pipelineId);
        break;
      }
      case 'action:requestFeatureAbort': {
        requestFeatureAbort(message.pipelineId, message.featureId);
        break;
      }
      case 'action:resolveGate': {
        resolveGate(message.gateId, message.decision);
        break;
      }
      case 'action:forceResolveGate': {
        forceResolveGate(message.gateId);
        break;
      }
      case 'action:resolveStageRequest': {
        resolveStageRequest(message.requestId, message.response);
        break;
      }
      case 'subscribe:output': {
        client.outputSubscriptions.add(message.runId);
        const rows = listRunOutput(message.runId, 120);
        for (const row of rows) {
          sendTo(client, {
            type: 'run:output',
            payload: {
              runId: row.runId,
              featureId: row.featureId,
              tool: row.tool,
              line: row.line,
              stream: row.stream,
              source: row.source,
            },
          });
        }
        break;
      }
      case 'unsubscribe:output': {
        client.outputSubscriptions.delete(message.runId);
        break;
      }
      case 'subscribe:runDetail': {
        client.detailSubscriptions.add(message.runId);
        sendRunDetail(client, message.runId);
        break;
      }
      case 'unsubscribe:runDetail': {
        client.detailSubscriptions.delete(message.runId);
        break;
      }
      case 'subscribe:runHistory': {
        client.historySubscriptions.add(message.featureId);
        sendRunHistory(client, message.featureId);
        break;
      }
      case 'unsubscribe:runHistory': {
        client.historySubscriptions.delete(message.featureId);
        break;
      }
      case 'subscribe:runChanges': {
        client.changesSubscriptions.add(message.runId);
        sendRunChanges(client, message.runId, featureCwd);
        break;
      }
      case 'unsubscribe:runChanges': {
        client.changesSubscriptions.delete(message.runId);
        break;
      }
      default: {
        break;
      }
    }
  }

  function sendRunHistory(client: Client, featureId: string): void {
    try {
      const { repoId } = resolveRepo(cwd);
      const runs = listRunHistoryForFeature(repoId, featureId);
      sendTo(client, { type: 'run:history', payload: { featureId, runs } });
    } catch {
      // DB unavailable — skip this update
    }
  }

  function sendRunChanges(client: Client, runId: number, featureCwd: string): void {
    sendTo(client, { type: 'run:changes', payload: computeRunChanges(runId, featureCwd) });
  }

  const outputUnsubscribe = msqEventBus.subscribe('run:output', (event) => {
    const data: WebSocketServerMessage = { type: 'run:output', payload: event };
    for (const client of clients.values()) {
      if (
        client.authenticated
        && client.outputSubscriptions.has(event.runId)
        && client.socket.readyState === 1 /* OPEN */
      ) {
        client.socket.send(JSON.stringify(data));
      }
    }
  });

  const DETAIL_REFRESH_EVENTS: (keyof MsqEvents)[] = [
    'task:started',
    'task:updated',
    'run:done',
    'run:failed',
    'tokens:update',
  ];

  const detailUnsubscribers = DETAIL_REFRESH_EVENTS.map((eventName) =>
    msqEventBus.subscribe(eventName, (event) => {
      const runId = 'runId' in event && typeof event.runId === 'number' ? event.runId : null;
      if (runId === null) return;
      for (const client of clients.values()) {
        if (client.authenticated && client.detailSubscriptions.has(runId) && client.socket.readyState === 1) {
          sendRunDetail(client, runId);
        }
      }
    }),
  );

  const HISTORY_AND_CHANGES_REFRESH_EVENTS: (keyof MsqEvents)[] = ['run:start', 'run:done', 'run:failed'];

  const historyAndChangesUnsubscribers = HISTORY_AND_CHANGES_REFRESH_EVENTS.map((eventName) =>
    msqEventBus.subscribe(eventName, (event) => {
      const runId = 'runId' in event && typeof event.runId === 'number' ? event.runId : null;
      const featureId = 'featureId' in event && typeof event.featureId === 'string' ? event.featureId : null;
      for (const client of clients.values()) {
        if (!client.authenticated || client.socket.readyState !== 1) continue;
        if (featureId && client.historySubscriptions.has(featureId)) sendRunHistory(client, featureId);
        if (runId !== null && client.changesSubscriptions.has(runId)) sendRunChanges(client, runId, cwd);
      }
    }),
  );

  function startFeature(
    featureId: string,
    featureCwd: string,
    overrides?: { tool?: string; model?: string; effort?: string },
  ): void {
    try {
      assertWritableDbPath();
      loadConfig();
      const backlog = loadBacklogFromCatalog(resolveRepo(featureCwd).repoId);
      validateBacklogSkills(backlog, featureCwd);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      msqEventBus.emit('ui:notice', { message: `Could not start ${featureId}: ${message}` });
      return;
    }

    const entrypoint = process.argv[1];
    if (!entrypoint) {
      msqEventBus.emit('ui:notice', { message: `Could not start ${featureId}: CLI entrypoint was not resolved.` });
      return;
    }

    const overrideArgs: string[] = [];
    if (overrides?.tool) overrideArgs.push('--tool', overrides.tool);
    if (overrides?.model) overrideArgs.push('--model', overrides.model);
    if (overrides?.effort) overrideArgs.push('--effort', overrides.effort);

    const child = spawn(
      process.execPath,
      [...process.execArgv, entrypoint, 'run', '--feature', featureId, ...overrideArgs],
      {
        detached: true,
        stdio: 'ignore',
        cwd: featureCwd,
      },
    );
    child.once('error', (error) => {
      msqEventBus.emit('ui:notice', { message: `Could not start ${featureId}: ${error.message}` });
    });
    child.unref();
    msqEventBus.emit('ui:info', { message: `Starting ${featureId}...` });
  }

  return {
    server: httpServer,
    wss,
    url: `http://${options.host}:${String(options.port)}`,
    close: async (): Promise<void> => {
      outputUnsubscribe();
      for (const unsubscribe of eventUnsubscribers) unsubscribe();
      for (const unsubscribe of detailUnsubscribers) unsubscribe();
      for (const unsubscribe of historyAndChangesUnsubscribers) unsubscribe();
      for (const client of clients.values()) {
        client.socket.terminate();
      }
      clients.clear();
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          wss.close(() => {
            resolve();
          });
        });
      });
    },
  };
}

export async function startWebServer(options: {
  host: string;
  port: number;
  auth: 'token' | 'none';
  token: string;
  cwd?: string;
}): Promise<RunningWebServer> {
  const running = createWebServer(options);
  return new Promise((resolve, reject) => {
    running.server.once('error', reject);
    running.server.listen(options.port, options.host, () => {
      running.server.off('error', reject);
      resolve(running);
    });
  });
}
