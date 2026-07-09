import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const mocks = vi.hoisted(() => ({
  resolveRepo: vi.fn(),
  listRunsForTui: vi.fn(),
  openGates: vi.fn(),
  listPendingStageRequests: vi.fn(),
  listRunningTaskRuns: vi.fn(),
  listRunsForStats: vi.fn(),
  resolveGate: vi.fn(),
  listRunOutput: vi.fn(),
  getFeatureCatalog: vi.fn(),
  getBacklogSettings: vi.fn(),
  pausePipeline: vi.fn(),
  resumePipeline: vi.fn(),
  abortPipeline: vi.fn(),
  requestFeatureAbort: vi.fn(),
  forceResolveGate: vi.fn(),
  resolveStageRequest: vi.fn(),
  getPendingFeatures: vi.fn(() => []),
}));

vi.mock('../../src/core/repo.js', () => ({
  resolveRepo: mocks.resolveRepo,
}));

vi.mock('../../src/db/repo.js', () => ({
  listRunsForTui: mocks.listRunsForTui,
  openGates: mocks.openGates,
  listPendingStageRequests: mocks.listPendingStageRequests,
  listRunningTaskRuns: mocks.listRunningTaskRuns,
  listRunsForStats: mocks.listRunsForStats,
  listRunOutput: mocks.listRunOutput,
  resolveGate: mocks.resolveGate,
  resolveStageRequest: mocks.resolveStageRequest,
  pausePipeline: mocks.pausePipeline,
  resumePipeline: mocks.resumePipeline,
  abortPipeline: mocks.abortPipeline,
  requestFeatureAbort: mocks.requestFeatureAbort,
  forceResolveGate: mocks.forceResolveGate,
}));

vi.mock('../../src/ui/catalog.js', () => ({
  getFeatureCatalog: mocks.getFeatureCatalog,
  getBacklogSettings: mocks.getBacklogSettings,
  getPendingFeatures: mocks.getPendingFeatures,
}));

function waitForOpen(socket: WebSocket, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), timeoutMs);
    socket.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForSocketMessage(socket: WebSocket, timeoutMs = 1000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket message timeout')), timeoutMs);
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString('utf8')));
    });
  });
}

function waitForClose(socket: WebSocket, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket close timeout')), timeoutMs);
    socket.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe('web server', () => {
  const previousCwd = process.cwd();
  let cwd = '';
  let server: Awaited<ReturnType<typeof import('../../src/web/server.js').createWebServer>> | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    cwd = mkdtempSync(join(tmpdir(), 'msq-web-'));
    process.chdir(cwd);
    mocks.resolveRepo.mockReturnValue({ repoId: 'repo-1', path: cwd });
    mocks.listRunsForTui.mockReturnValue([]);
    mocks.openGates.mockReturnValue([]);
    mocks.listPendingStageRequests.mockReturnValue([]);
    mocks.listRunningTaskRuns.mockReturnValue([]);
    mocks.listRunsForStats.mockReturnValue([]);
    mocks.listRunOutput.mockReturnValue([]);
    mocks.getFeatureCatalog.mockReturnValue({});
    mocks.getBacklogSettings.mockReturnValue({ stageSkills: {} });
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    process.chdir(previousCwd);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('serves the index page and health endpoint without auth', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const indexRes = await fetch(`${base}/`);
    expect(indexRes.status).toBe(200);
    const body = await indexRes.text();
    expect(body).toContain('msq web');

    const healthRes = await fetch(`${base}/api/health`);
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toEqual({ status: 'ok' });
  });

  it('rejects /api/state without a token', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(`${base}/api/state`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns /api/state with a valid bearer token', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(`${base}/api/state`, { headers: { Authorization: 'Bearer secret' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.repoLabel).toBe(cwd.split('/').pop());
    expect(json.runs).toEqual([]);
    expect(json.gates).toEqual([]);
  });

  it('authenticates WebSocket with a valid token and sends full state', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    const message = await waitForSocketMessage(socket);
    expect((message as { type: string }).type).toBe('state:full');
    socket.close();
  });

  it('closes WebSocket with invalid token', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'wrong' }));
    await waitForClose(socket);
  });

  it('broadcasts events from the event bus to authenticated clients', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    const { msqEventBus } = await import('../../src/core/events/index.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    msqEventBus.emit('ui:info', { message: 'hello' });
    const message = await waitForSocketMessage(socket);
    expect((message as { type: string }).type).toBe('ui:info');
    expect((message as { payload: { message: string } }).payload.message).toBe('hello');
    socket.close();
  });

  it('executes resolveGate action received via WebSocket', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    socket.send(JSON.stringify({ type: 'action:resolveGate', gateId: 7, decision: 'approved' }));

    await vi.waitFor(() => {
      expect(mocks.resolveGate).toHaveBeenCalledWith(7, 'approved');
    });

    socket.close();
  });
});
