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
  getPipeline,
  listCompletedFeatureIds,
  listRunEvents,
  listRunHistoryForFeature,
  getRunSessionStatus,
  listRunOutput,
  listRunOutputAfterId,
  listRunToolCalls,
  listTaskRunsForRun,
  pausePipeline,
  requestFeatureAbort,
  resolveGate,
  resolveStageRequest,
  resumePipeline,
} from '../db/repo.js';
import { getAdapter } from '../core/adapters/index.js';
import { computeRunBreakdown } from '../core/stats.js';
import { resolveRepo } from '../core/repo.js';
import { loadBacklogFromCatalog } from '../core/backlog/load.js';
import { selectStartableFeaturePlan } from '../core/orchestrator/graph.js';
import { validateBacklogSkills } from '../core/skills/index.js';
import { ConfigSchema, loadConfig, resolveRuntimeConfig, saveConfig, type ToolRegistryEntry } from '../config/index.js';
import { updateCatalogFeature, updateCatalogTask, updateCatalogDefaults, type FeaturePatch, type CatalogDefaultsPatch } from '../db/backlogCatalog.js';
import type { Feature, Task } from '../core/backlog/schema.js';
import { buildMsqWebState, appendNotification, resetWebStateCaches } from './state.js';
import { createWebAuth, isAllowedHostHeader, isAllowedOrigin, timingSafeEqualStrings } from './auth.js';
import type {
  FeatureConfigPatch,
  FeatureConfigSaveIssue,
  FeatureConfigSaveResult,
  ProjectDefaultsPatch,
  RunChangesPayload,
  TaskConfigPatch,
  WebSocketClientMessage,
  WebSocketServerMessage,
} from './types.js';

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
  outputLastIdByRun: Map<number, number>;
  detailSubscriptions: Set<number>;
  historySubscriptions: Set<string>;
  changesSubscriptions: Set<number>;
  detailPayloadSignatures: Map<number, string>;
  historyPayloadSignatures: Map<string, string>;
  changesPayloadSignatures: Map<number, string>;
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

const MAX_AUTH_BODY_BYTES = 8192;

/** Reads a request body up to a size cap, rejecting oversized payloads
 * instead of buffering unbounded attacker-controlled input. */
async function readRequestBody(req: IncomingMessage, maxBytes = MAX_AUTH_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function renderLoginPage(error: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>msq web login</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #111; color: #eee; }
  form { background: #1c1c1c; padding: 2rem; border-radius: 8px; min-width: 280px; }
  h1 { font-size: 1.1rem; margin: 0 0 1rem; }
  input { width: 100%; padding: 0.5rem; margin: 0.5rem 0 1rem; box-sizing: border-box; border-radius: 4px; border: 1px solid #333; background: #0d0d0d; color: #eee; }
  button { width: 100%; padding: 0.5rem; cursor: pointer; border-radius: 4px; border: none; background: #4a7dff; color: #fff; }
  .error { color: #f66; margin: 0 0 0.75rem; font-size: 0.9rem; }
</style>
</head>
<body>
<form method="post" action="/auth">
  <h1>msq web</h1>
  ${error ? '<p class="error">Incorrect password.</p>' : ''}
  <input type="password" name="password" placeholder="Password" autofocus required autocomplete="current-password" />
  <button type="submit">Log in</button>
</form>
</body>
</html>`;
}

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
  'run:status',
  'tool:call',
  'run:done',
  'run:failed',
  'run:blocked',
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
  'autopilot:decision',
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
  const cwd = options.cwd ?? process.cwd();
  const webAuth = createWebAuth();
  let latestState = buildMsqWebState();
  let latestStateSignature = JSON.stringify(latestState);

  process.on('uncaughtException', (error) => {
    console.error('[web] uncaughtException:', error.message);
    console.error(error.stack);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[web] unhandledRejection:', reason);
  });

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

  function buildCurrentState(): typeof latestState {
    const nextState = buildMsqWebState();
    return latestState.notifications.length > 0
      ? { ...nextState, notifications: latestState.notifications }
      : nextState;
  }

  function refreshState(): void {
    latestState = buildCurrentState();
    latestStateSignature = JSON.stringify(latestState);
  }

  function buildRunDetailPayload(runId: number): { runId: number; taskRuns: ReturnType<typeof listTaskRunsForRun>; breakdown: ReturnType<typeof computeRunBreakdown> | null; sessionStatus: ReturnType<typeof getRunSessionStatus>; statusHistory: ReturnType<typeof getStatusHistory>; toolCalls: ReturnType<typeof listRunToolCalls> } | null {
    try {
      const taskRuns = listTaskRunsForRun(runId);
      const runEvents = listRunEvents(runId);
      const startedAt = runEvents.find((event) => event.event === 'start')?.createdAt ?? null;
      const endedAt = runEvents.find((event) => event.event === 'done' || event.event === 'failed')?.createdAt ?? null;
      const breakdown = startedAt ? computeRunBreakdown(runEvents, startedAt, endedAt) : null;
      return { runId, taskRuns, breakdown, sessionStatus: getRunSessionStatus(runId), statusHistory: getStatusHistory(runEvents), toolCalls: listRunToolCalls(runId) };
    } catch {
      return null;
    }
  }

  function getStatusHistory(events: ReturnType<typeof listRunEvents>): NonNullable<ReturnType<typeof getRunSessionStatus>>[] {
    return events
      .filter((event) => event.event.startsWith('status:') && event.metadata)
      .map((event) => event.metadata as unknown as NonNullable<ReturnType<typeof getRunSessionStatus>>);
  }

  function sendRunDetail(client: Client, runId: number, force = false): void {
    const payload = buildRunDetailPayload(runId);
    if (!payload) return;
    const signature = JSON.stringify(payload);
    if (!force && client.detailPayloadSignatures.get(runId) === signature) return;
    client.detailPayloadSignatures.set(runId, signature);
    sendTo(client, { type: 'run:detail', payload });
  }

  function sendRunHistory(client: Client, featureId: string, force = false): void {
    try {
      const { repoId } = resolveRepo(cwd);
      const payload = { featureId, runs: listRunHistoryForFeature(repoId, featureId) };
      const signature = JSON.stringify(payload);
      if (!force && client.historyPayloadSignatures.get(featureId) === signature) return;
      client.historyPayloadSignatures.set(featureId, signature);
      sendTo(client, { type: 'run:history', payload });
    } catch {
      // DB unavailable — skip this update
    }
  }

  function sendRunChanges(client: Client, runId: number, featureCwd: string, force = false): void {
    const payload = computeRunChanges(runId, featureCwd);
    const signature = JSON.stringify(payload);
    if (!force && client.changesPayloadSignatures.get(runId) === signature) return;
    client.changesPayloadSignatures.set(runId, signature);
    sendTo(client, { type: 'run:changes', payload });
  }

  function refreshSubscribedViews(featureCwd: string): void {
    for (const client of clients.values()) {
      if (!client.authenticated || client.socket.readyState !== 1 /* OPEN */) continue;
      for (const runId of client.detailSubscriptions) sendRunDetail(client, runId);
      for (const featureId of client.historySubscriptions) sendRunHistory(client, featureId);
      for (const runId of client.changesSubscriptions) sendRunChanges(client, runId, featureCwd);
    }
  }

  function reconcileWebState(
    featureCwd: string,
    options: { forceBroadcast?: boolean; refreshSubscriptions?: boolean } = {},
  ): boolean {
    const nextState = buildCurrentState();
    const nextSignature = JSON.stringify(nextState);
    const changed = options.forceBroadcast === true || nextSignature !== latestStateSignature;
    latestState = nextState;
    latestStateSignature = nextSignature;
    if (changed) {
      broadcast({ type: 'state:full', payload: latestState });
    }
    if (options.refreshSubscriptions !== false) {
      refreshSubscribedViews(featureCwd);
    }
    return changed;
  }

  const eventUnsubscribers = BROADCAST_EVENTS.map((event) =>
    msqEventBus.subscribe(event, (payload) => {
      if (event === 'ui:notice' || event === 'ui:info') {
        const payloadObj = payload as Record<string, unknown> | null;
        const message = payloadObj && typeof payloadObj === 'object' && 'message' in payloadObj && typeof payloadObj.message === 'string'
          ? payloadObj.message
          : JSON.stringify(payload);
        console.log(`[event:${event}]`, message);
      }
      if (event === 'run:status' || event === 'tool:call') {
        const runId = (payload as { runId?: number }).runId;
        for (const client of clients.values()) {
          if (client.authenticated && runId != null && client.detailSubscriptions.has(runId) && client.socket.readyState === 1) {
            client.socket.send(JSON.stringify({ type: event, payload }));
          }
        }
      } else {
        broadcast({ type: event, payload });
      }
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
        latestStateSignature = JSON.stringify(latestState);
        broadcast({ type: 'state:full', payload: latestState });
        return;
      }
      if (event !== 'run:output' && event !== 'budget:alert') {
        reconcileWebState(cwd);
      }
    }),
  );

  function extractToken(req: IncomingMessage): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    return null;
  }

  function isValidToken(token: string | null): boolean {
    return token !== null && options.token.length > 0 && timingSafeEqualStrings(token, options.token);
  }

  function isAuthenticated(req: IncomingMessage): boolean {
    if (options.auth === 'none') return true;
    if (webAuth.hasValidSession(req.headers.cookie)) return true;
    return isValidToken(extractToken(req));
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
    void handleRequest(req, res);
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    try {
      if (!isAllowedHostHeader(req.headers.host, options.host)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden host');
        return;
      }

      if (pathname === '/auth') {
        if (options.auth === 'none' || webAuth.hasValidSession(req.headers.cookie)) {
          res.writeHead(302, { Location: '/' });
          res.end();
          return;
        }

        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(renderLoginPage(false));
          return;
        }

        if (req.method === 'POST') {
          let body: string;
          try {
            body = await readRequestBody(req);
          } catch {
            res.writeHead(413, { 'Content-Type': 'text/plain' });
            res.end('Payload too large');
            return;
          }
          const password = new URLSearchParams(body).get('password') ?? '';
          if (!isValidToken(password)) {
            res.writeHead(401, { 'Content-Type': 'text/html' });
            res.end(renderLoginPage(true));
            return;
          }
          const sessionId = webAuth.createSession();
          res.writeHead(302, { Location: '/', 'Set-Cookie': webAuth.sessionCookie(sessionId) });
          res.end();
          return;
        }

        res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'GET, POST' });
        res.end('Method not allowed');
        return;
      }

      if (pathname === '/logout') {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'POST' });
          res.end('Method not allowed');
          return;
        }
        webAuth.invalidateSession(req.headers.cookie);
        res.writeHead(302, { Location: '/auth', 'Set-Cookie': webAuth.expiredSessionCookie() });
        res.end();
        return;
      }

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
        if (!isAuthenticated(req)) {
          res.writeHead(302, { Location: '/auth' });
          res.end();
          return;
        }
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
  }

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (rawSocket, req: IncomingMessage) => {
    const socket = rawSocket as HeartbeatWebSocket;
    // A page on any site can open a WebSocket to 127.0.0.1 (CSWSH) and a
    // DNS-rebinding page reaches here with a foreign Host — reject both
    // before any state or auth handling.
    if (!isAllowedOrigin(req.headers.origin, options.host) || !isAllowedHostHeader(req.headers.host, options.host)) {
      socket.close(1008, 'Forbidden origin');
      return;
    }
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
      authenticated: options.auth === 'none' || webAuth.hasValidSession(req.headers.cookie),
      outputSubscriptions: new Set(),
      outputLastIdByRun: new Map(),
      detailSubscriptions: new Set(),
      historySubscriptions: new Set(),
      changesSubscriptions: new Set(),
      detailPayloadSignatures: new Map(),
      historyPayloadSignatures: new Map(),
      changesPayloadSignatures: new Map(),
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
        if (client.authenticated) {
          // state:full was already sent on connection (auth=none or session cookie)
          return;
        }
        if (isValidToken(message.token)) {
          client.authenticated = true;
          refreshState();
          sendTo(client, { type: 'state:full', payload: latestState });
        } else {
          socket.close(1008, 'Invalid token');
        }
        return;
      }

      if (!client.authenticated) {
        socket.close(1008, 'Not authenticated');
        return;
      }

      try {
        console.log(`[ws] received message type=${message.type}`);
        handleClientMessage(message, client, cwd);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(`[ws] handleClientMessage error for ${message.type}: ${errorMessage}`);
        if (errorStack) console.error(errorStack);
        sendTo(client, { type: 'error', payload: { message: errorMessage } });
      }
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(socket);
    });

    // Cookie-authenticated browsers and auth=none get full state immediately
    if (client.authenticated) {
      refreshState();
      sendTo(client, { type: 'state:full', payload: latestState });
    } else {
      // Allow a window for auth before closing unauthenticated sockets
      const timer = setTimeout(() => {
        if (!client.authenticated && socket.readyState === 1 /* OPEN */) {
          socket.close(1008, 'Authentication required');
        }
      }, 60_000);
      timer.unref();
    }
  });

  function handleClientMessage(
    message: Exclude<WebSocketClientMessage, { type: 'auth' }>,
    client: Client,
    featureCwd: string,
  ): void {
    switch (message.type) {
      case 'action:startFeature': {
        startFeature(message.featureId, featureCwd);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:updateFeatureConfig': {
        const result = updateFeatureConfig(message.featureId, message.patch, featureCwd);
        sendTo(client, result);
        if (result.payload.ok) {
          reconcileWebState(featureCwd);
          msqEventBus.emit('ui:info', { message: `Saved config for ${message.featureId}.` });
        } else {
          msqEventBus.emit('ui:notice', {
            message: `Could not save config for ${message.featureId}: ${result.payload.issues?.[0]?.message ?? 'Unknown error'}`,
          });
        }
        break;
      }
      case 'action:updateTaskConfig': {
        updateTaskConfig(message.featureId, message.taskId, message.patch, featureCwd);
        break;
      }
      case 'action:updateProjectDefaults': {
        updateProjectDefaults(message.patch, featureCwd);
        break;
      }
      case 'action:updateToolsRegistry': {
        updateToolsRegistry(message.tools, featureCwd);
        break;
      }
      case 'action:pausePipeline': {
        pausePipeline(message.pipelineId);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:resumePipeline': {
        resumePipeline(message.pipelineId);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:abortPipeline': {
        abortPipeline(message.pipelineId);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:requestFeatureAbort': {
        requestFeatureAbort(message.pipelineId, message.featureId);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:resolveGate': {
        resolveGate(message.gateId, message.decision);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:forceResolveGate': {
        forceResolveGate(message.gateId);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:resolveStageRequest': {
        resolveStageRequest(message.requestId, message.response);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:resumeWithOverride': {
        resumeWithOverride(message.pipelineId, message.featureId, message.tool, message.model, message.effort);
        reconcileWebState(featureCwd);
        break;
      }
      case 'subscribe:output': {
        client.outputSubscriptions.add(message.runId);
        const rows = listRunOutput(message.runId, 120);
        const lastRow = rows.length > 0 ? rows[rows.length - 1] : undefined;
        const lastId = lastRow ? lastRow.id : 0;
        client.outputLastIdByRun.set(message.runId, lastId);
        for (const row of rows) {
          sendTo(client, {
            type: 'run:output',
            payload: {
              id: row.id,
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
        client.outputLastIdByRun.delete(message.runId);
        break;
      }
      case 'subscribe:runDetail': {
        client.detailSubscriptions.add(message.runId);
        sendRunDetail(client, message.runId);
        const detail = buildRunDetailPayload(message.runId);
        if (detail?.sessionStatus) sendTo(client, { type: 'run:status', payload: detail.sessionStatus });
        for (const toolCall of detail?.toolCalls ?? []) sendTo(client, { type: 'tool:call', payload: toolCall });
        break;
      }
      case 'unsubscribe:runDetail': {
        client.detailSubscriptions.delete(message.runId);
        client.detailPayloadSignatures.delete(message.runId);
        break;
      }
      case 'subscribe:runHistory': {
        client.historySubscriptions.add(message.featureId);
        sendRunHistory(client, message.featureId, true);
        break;
      }
      case 'unsubscribe:runHistory': {
        client.historySubscriptions.delete(message.featureId);
        client.historyPayloadSignatures.delete(message.featureId);
        break;
      }
      case 'subscribe:runChanges': {
        client.changesSubscriptions.add(message.runId);
        sendRunChanges(client, message.runId, featureCwd, true);
        break;
      }
      case 'unsubscribe:runChanges': {
        client.changesSubscriptions.delete(message.runId);
        client.changesPayloadSignatures.delete(message.runId);
        break;
      }
      default: {
        break;
      }
    }
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

  function startFeature(
    featureId: string,
    featureCwd: string,
  ): void {
    try {
      console.log(`[startFeature] featureId=${featureId}`);
      assertWritableDbPath();
      resolveRuntimeConfig(featureCwd);
      const repo = resolveRepo(featureCwd);
      const backlog = loadBacklogFromCatalog(repo.repoId, featureCwd);
      validateBacklogSkills(backlog, featureCwd);
      const plan = selectStartableFeaturePlan(backlog, featureId, listCompletedFeatureIds(repo.repoId));
      if (plan.pendingDependencies.length > 0) {
        throw new Error(`pending dependencies: ${plan.pendingDependencies.join(', ')}. Complete them before starting ${featureId}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(`[startFeature] error: ${message}`);
      if (stack) console.error(stack);
      msqEventBus.emit('ui:notice', { message: `Could not start ${featureId}: ${message}` });
      return;
    }

    const entrypoint = process.argv[1];
    if (!entrypoint) {
      msqEventBus.emit('ui:notice', { message: `Could not start ${featureId}: CLI entrypoint was not resolved.` });
      return;
    }

    const child = spawn(
      process.execPath,
      [...process.execArgv, entrypoint, 'run', '--feature', featureId],
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

  /** Mirrors `src/commands/resume.ts`: validates the override tool is available
   * before spawning, so an unavailable tool never creates a run (FR-002/FR-003).
   * The backlog itself is never touched — the override is passed as spawn args
   * only (FR-004). */
  function resumeWithOverride(
    pipelineId: number,
    featureId: string,
    tool?: string,
    model?: string,
    effort?: string,
  ): void {
    const pipeline = getPipeline(pipelineId);
    if (!pipeline) {
      msqEventBus.emit('ui:notice', { message: `Pipeline ${String(pipelineId)} not found — resume aborted.` });
      return;
    }
    if (!pipeline.cwd) {
      msqEventBus.emit('ui:notice', { message: `Pipeline ${String(pipelineId)} has no cwd persisted — resume aborted.` });
      return;
    }

    if (tool) {
      const adapter = getAdapter(tool);
      if (!adapter.isAvailable?.()) {
        msqEventBus.emit('ui:notice', { message: `Tool "${tool}" is unavailable — resume aborted, no run created.` });
        return;
      }
    }

    const entrypoint = process.argv[1];
    if (!entrypoint) {
      msqEventBus.emit('ui:notice', { message: `Could not resume ${featureId}: CLI entrypoint was not resolved.` });
      return;
    }

    const args = [...process.execArgv, entrypoint, 'resume', String(pipelineId)];
    if (tool) args.push('--tool', tool);
    if (model) args.push('--model', model);
    if (effort) args.push('--effort', effort);

    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      cwd: pipeline.cwd,
    });
    child.once('error', (error) => {
      msqEventBus.emit('ui:notice', { message: `Could not resume ${featureId}: ${error.message}` });
    });
    child.unref();
    msqEventBus.emit('ui:info', { message: `Resuming ${featureId}...` });
  }

  function toFeaturePatch(patch: FeatureConfigPatch): FeaturePatch {
    return {
      ...(patch.spec !== undefined ? { spec: patch.spec } : {}),
      ...(patch.tool !== undefined ? { tool: patch.tool } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.effort !== undefined ? { effort: patch.effort as Feature['effort'] } : {}),
      ...(patch.thinking !== undefined ? { thinking: patch.thinking as Feature['thinking'] } : {}),
      ...(patch.maxTokens !== undefined ? { maxTokens: patch.maxTokens } : {}),
      ...(patch.autoStart !== undefined ? { autoStart: patch.autoStart } : {}),
      ...(patch.skills !== undefined ? { skills: patch.skills } : {}),
      ...(patch.workflow !== undefined
        ? { workflow: patch.workflow as FeaturePatch['workflow'] }
        : {}),
      ...(patch.retry !== undefined ? { retry: patch.retry as FeaturePatch['retry'] } : {}),
    };
  }

  function featureConfigSaveIssues(error: unknown): FeatureConfigSaveIssue[] {
    const errorWithIssues = typeof error === 'object' && error !== null
      ? error as { issues?: unknown }
      : undefined;
    if (Array.isArray(errorWithIssues?.issues)) {
      const issues = errorWithIssues.issues.flatMap((issue): FeatureConfigSaveIssue[] => {
        if (typeof issue !== 'object' || issue === null) return [];
        const candidate = issue as { message?: unknown; path?: unknown };
        if (typeof candidate.message !== 'string') return [];
        const message = candidate.message;
        const pathValue = Array.isArray(candidate.path) ? candidate.path.map((value) => String(value)).join('.') : undefined;
        const path = pathValue === '' ? undefined : pathValue;
        return [{ path, message }];
      });
      if (issues.length > 0) return issues;
    }
    return [{ message: error instanceof Error ? error.message : String(error) }];
  }

  function updateFeatureConfig(featureId: string, patch: FeatureConfigPatch, featureCwd: string): FeatureConfigSaveResult {
    try {
      console.log(`[updateFeatureConfig] featureId=${featureId}, patch=`, patch);
      assertWritableDbPath();
      const { repoId } = resolveRepo(featureCwd);
      updateCatalogFeature(repoId, featureId, toFeaturePatch(patch));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(`[updateFeatureConfig] error: ${message}`);
      if (stack) console.error(stack);
      return { type: 'featureConfig:saveResult', payload: { featureId, ok: false, issues: featureConfigSaveIssues(error) } };
    }
    return { type: 'featureConfig:saveResult', payload: { featureId, ok: true } };
  }

  function updateTaskConfig(featureId: string, taskId: string, patch: TaskConfigPatch, featureCwd: string): void {
    try {
      console.log(`[updateTaskConfig] featureId=${featureId}, taskId=${taskId}, patch=`, patch);
      assertWritableDbPath();
      resolveRepo(featureCwd);
      updateCatalogTask(featureId, taskId, patch as Partial<Task>);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(`[updateTaskConfig] error: ${message}`);
      if (stack) console.error(stack);
      msqEventBus.emit('ui:notice', { message: `Could not save task ${taskId}: ${message}` });
      return;
    }
    reconcileWebState(featureCwd);
    msqEventBus.emit('ui:info', { message: `Saved task ${taskId}.` });
  }

  function updateProjectDefaults(patch: ProjectDefaultsPatch, featureCwd: string): void {
    try {
      console.log(`[updateProjectDefaults] patch=`, patch);
      assertWritableDbPath();
      const { repoId } = resolveRepo(featureCwd);
      updateCatalogDefaults(repoId, patch as CatalogDefaultsPatch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(`[updateProjectDefaults] error: ${message}`);
      if (stack) console.error(stack);
      msqEventBus.emit('ui:notice', { message: `Could not save project defaults: ${message}` });
      return;
    }
    reconcileWebState(featureCwd);
    msqEventBus.emit('ui:info', { message: 'Saved project defaults.' });
  }

  function updateToolsRegistry(tools: ToolRegistryEntry[], featureCwd: string): void {
    try {
      console.log(`[updateToolsRegistry] tools=${tools.map((tool) => tool.id).join(',')}`);
      // loadConfig + saveConfig are intentional here: this is App-level state,
      // not catalog state, and ConfigSchema owns duplicate-id/full-entry validation.
      saveConfig(ConfigSchema.parse({ ...loadConfig(), tools }));
      resetWebStateCaches();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[updateToolsRegistry] error: ${message}`);
      msqEventBus.emit('ui:notice', { message: `Could not save tools registry: ${message}` });
      return;
    }
    reconcileWebState(featureCwd);
    msqEventBus.emit('ui:info', { message: 'Saved tools registry.' });
  }

  // Poll the DB for new output rows written by separated feature-runner
  // processes (started as detached `msq run --feature` children). Those
  // processes share the SQLite database, but NOT the in-process `msqEventBus`
  // — so the `outputUnsubscribe` subscriber above only fires for adapters
  // that run in this same process. The poll picks up output written by
  // other processes every 1s and forwards new rows to subscribed clients.
  const outputPollInterval = setInterval(() => {
    for (const client of clients.values()) {
      if (!client.authenticated || client.socket.readyState !== 1) continue;
      if (client.outputSubscriptions.size === 0) continue;
      for (const runId of client.outputSubscriptions) {
        const afterId = client.outputLastIdByRun.get(runId) ?? 0;
        const rows = listRunOutputAfterId(runId, afterId);
        if (rows.length === 0) continue;
        const lastRow = rows[rows.length - 1];
        if (!lastRow) continue;
        const newLastId = lastRow.id;
        client.outputLastIdByRun.set(runId, newLastId);
        for (const row of rows) {
          client.socket.send(JSON.stringify({
            type: 'run:output',
            payload: {
              id: row.id,
              runId: row.runId,
              featureId: row.featureId,
              tool: row.tool,
              line: row.line,
              stream: row.stream,
              source: row.source,
            },
          }));
        }
      }
    }
  }, 1000);
  outputPollInterval.unref();

  const reconcilePollInterval = setInterval(() => {
    const hasAuthenticatedClients = Array.from(clients.values()).some(
      (client) => client.authenticated && client.socket.readyState === 1 /* OPEN */,
    );
    if (!hasAuthenticatedClients) return;
    reconcileWebState(cwd);
  }, 1000);
  reconcilePollInterval.unref();

  return {
    server: httpServer,
    wss,
    url: `http://${options.host}:${String(options.port)}`,
    close: async (): Promise<void> => {
      clearInterval(outputPollInterval);
      clearInterval(reconcilePollInterval);
      outputUnsubscribe();
      for (const unsubscribe of eventUnsubscribers) unsubscribe();
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
