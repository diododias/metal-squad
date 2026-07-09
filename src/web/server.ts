import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocketServer, type WebSocket } from 'ws';
import type { MsqEvents } from '../core/events/types.js';
import { msqEventBus } from '../core/events/index.js';
import { assertWritableDbPath } from '../db/index.js';
import {
  abortPipeline,
  forceResolveGate,
  listRunEvents,
  listRunOutput,
  listTaskRunsForRun,
  pausePipeline,
  requestFeatureAbort,
  resolveGate,
  resolveStageRequest,
  resumePipeline,
} from '../db/repo.js';
import { computeRunBreakdown } from '../core/stats.js';
import { loadBacklog } from '../core/backlog/load.js';
import { validateBacklogSkills } from '../core/skills/index.js';
import { loadConfig } from '../config/index.js';
import { buildMsqWebState, appendNotification } from './state.js';
import type { WebSocketClientMessage, WebSocketServerMessage } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATIC_DIR = join(__dirname, 'static');

interface Client {
  socket: WebSocket;
  authenticated: boolean;
  outputSubscriptions: Set<number>;
  detailSubscriptions: Set<number>;
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
  const clients = new Map<WebSocket, Client>();
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

  wss.on('connection', (socket) => {
    const client: Client = {
      socket,
      authenticated: options.auth === 'none',
      outputSubscriptions: new Set(),
      detailSubscriptions: new Set(),
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
        startFeature(message.featureId, featureCwd);
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

  function startFeature(featureId: string, featureCwd: string): void {
    try {
      assertWritableDbPath();
      loadConfig();
      const backlog = loadBacklog(undefined, featureCwd);
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

    const child = spawn(process.execPath, [...process.execArgv, entrypoint, 'run', '--feature', featureId], {
      detached: true,
      stdio: 'ignore',
      cwd: featureCwd,
    });
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
