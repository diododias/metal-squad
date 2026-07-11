import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const mocks = vi.hoisted(() => ({
  resolveRepo: vi.fn(),
  listRunsForTui: vi.fn(),
  listRunHistoryForFeature: vi.fn(),
  openGates: vi.fn(),
  listPendingStageRequests: vi.fn(),
  listRunningTaskRuns: vi.fn(),
  listRunsForStats: vi.fn(),
  getHistoricalTokenStatsForFeatureProfile: vi.fn(),
  resolveGate: vi.fn(),
  listRunOutput: vi.fn(),
  listTaskRunsForRun: vi.fn(),
  listRunEvents: vi.fn(),
  getFeatureCatalog: vi.fn(),
  getBacklogSettings: vi.fn(),
  pausePipeline: vi.fn(),
  resumePipeline: vi.fn(),
  abortPipeline: vi.fn(),
  requestFeatureAbort: vi.fn(),
  forceResolveGate: vi.fn(),
  resolveStageRequest: vi.fn(),
  getPendingFeatures: vi.fn(() => []),
  computeRunBreakdown: vi.fn(),
  assertWritableDbPath: vi.fn(),
  updateCatalogFeature: vi.fn(),
  updateCatalogTask: vi.fn(),
}));

vi.mock('../../src/core/repo.js', () => ({
  resolveRepo: mocks.resolveRepo,
}));

vi.mock('../../src/db/index.js', () => ({
  assertWritableDbPath: mocks.assertWritableDbPath,
}));

vi.mock('../../src/db/backlogCatalog.js', () => ({
  updateCatalogFeature: mocks.updateCatalogFeature,
  updateCatalogTask: mocks.updateCatalogTask,
}));

vi.mock('../../src/db/repo.js', () => ({
  listRunsForTui: mocks.listRunsForTui,
  listRunHistoryForFeature: mocks.listRunHistoryForFeature,
  openGates: mocks.openGates,
  listPendingStageRequests: mocks.listPendingStageRequests,
  listRunningTaskRuns: mocks.listRunningTaskRuns,
  listRunsForStats: mocks.listRunsForStats,
  getHistoricalTokenStatsForFeatureProfile: mocks.getHistoricalTokenStatsForFeatureProfile,
  listRunOutput: mocks.listRunOutput,
  listTaskRunsForRun: mocks.listTaskRunsForRun,
  listRunEvents: mocks.listRunEvents,
  resolveGate: mocks.resolveGate,
  resolveStageRequest: mocks.resolveStageRequest,
  pausePipeline: mocks.pausePipeline,
  resumePipeline: mocks.resumePipeline,
  abortPipeline: mocks.abortPipeline,
  requestFeatureAbort: mocks.requestFeatureAbort,
  forceResolveGate: mocks.forceResolveGate,
}));

vi.mock('../../src/core/stats.js', () => ({
  computeRunBreakdown: mocks.computeRunBreakdown,
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

async function waitForMessageType(socket: WebSocket, expectedType: string, timeoutMs = 1000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${expectedType}`)), timeoutMs);
    const handler = (data: WebSocket.RawData): void => {
      try {
        const message = JSON.parse(data.toString('utf8')) as { type: string };
        if (message.type === expectedType) {
          clearTimeout(timer);
          socket.off('message', handler);
          resolve(message);
        }
      } catch {
        // ignore invalid JSON
      }
    };
    socket.on('message', handler);
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
    mocks.listTaskRunsForRun.mockReturnValue([]);
    mocks.listRunEvents.mockReturnValue([]);
    mocks.listRunHistoryForFeature.mockReturnValue([]);
    mocks.getHistoricalTokenStatsForFeatureProfile.mockReturnValue({
      sampleSize: 0,
      avgTotalTokens: null,
      medianTotalTokens: null,
    });
    mocks.computeRunBreakdown.mockReturnValue({
      wallMs: 1000,
      gateWaitMs: 0,
      retryWaitMs: 0,
      agentMs: 1000,
      retryCount: 0,
    });
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

  it('includes featureCatalog and backlogSettings in full state', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.getFeatureCatalog.mockReturnValue({
      feat1: { id: 'feat1', title: 'Feature One', tool: 'claude', effort: 'M', skills: [], dependsOn: [], workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true } },
    });
    mocks.getBacklogSettings.mockReturnValue({ stageSkills: { specify: ['speckit-specify'] } });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    const message = await waitForSocketMessage(socket);
    const payload = (message as { type: string; payload: { featureCatalog: Record<string, unknown>; backlogSettings: unknown } }).payload;
    expect(payload.featureCatalog).toHaveProperty('feat1');
    expect(payload.backlogSettings).toEqual({ stageSkills: { specify: ['speckit-specify'] } });
    socket.close();
  });

  it('sends run:detail immediately on subscribe:runDetail', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.listTaskRunsForRun.mockReturnValue([
      { id: 1, runId: 42, taskId: 't1', title: 'Task one', status: 'done', stage: 'specify', startedAt: null, endedAt: null },
    ]);
    mocks.listRunEvents.mockReturnValue([
      { id: 1, runId: 42, event: 'start', createdAt: '2026-07-09T10:00:00.000Z', metadata: {} },
    ]);

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    socket.send(JSON.stringify({ type: 'subscribe:runDetail', runId: 42 }));
    const message = await waitForMessageType(socket, 'run:detail');
    const payload = (message as { type: string; payload: { runId: number; taskRuns: unknown[]; breakdown: unknown } }).payload;
    expect(payload.runId).toBe(42);
    expect(payload.taskRuns).toHaveLength(1);
    expect(payload.taskRuns[0]).toHaveProperty('taskId', 't1');
    expect(payload.breakdown).toEqual({ wallMs: 1000, gateWaitMs: 0, retryWaitMs: 0, agentMs: 1000, retryCount: 0 });
    socket.close();
  });

  it('pushes run:detail on task:updated and stops after unsubscribe:runDetail', async () => {
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

    socket.send(JSON.stringify({ type: 'subscribe:runDetail', runId: 42 }));
    await waitForMessageType(socket, 'run:detail');

    mocks.listTaskRunsForRun.mockReturnValue([
      { id: 1, runId: 42, taskId: 't1', title: 'Task one', status: 'running', stage: 'specify', startedAt: null, endedAt: null },
    ]);
    msqEventBus.emit('task:updated', { runId: 42, featureId: 'feat1', taskId: 't1', status: 'running' });
    const pushed = await waitForMessageType(socket, 'run:detail');
    expect((pushed as { payload: { taskRuns: { status: string }[] } }).payload.taskRuns[0].status).toBe('running');

    socket.send(JSON.stringify({ type: 'unsubscribe:runDetail', runId: 42 }));
    msqEventBus.emit('task:updated', { runId: 42, featureId: 'feat1', taskId: 't1', status: 'done' });

    let extraMessage = false;
    const failTimer = setTimeout(() => {
      extraMessage = false;
    }, 400);
    const handler = (): void => { extraMessage = true; };
    socket.on('message', handler);
    await new Promise((resolve) => setTimeout(resolve, 500));
    clearTimeout(failTimer);
    socket.off('message', handler);
    expect(extraMessage).toBe(false);

    socket.close();
  });

  // F34 item 1/2: run history subscription
  it('sends run:history immediately on subscribe:runHistory', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.listRunHistoryForFeature.mockReturnValue([
      { runId: 1, repoId: 'repo-1', featureId: 'feat-1', tool: 'claude', stage: 'implement', status: 'failed', startedAt: '2026-07-06T10:00:00', endedAt: '2026-07-06T10:05:00', totalTokens: 500, pipelineResumeSummary: null },
    ]);

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    socket.send(JSON.stringify({ type: 'subscribe:runHistory', featureId: 'feat-1' }));
    const message = await waitForMessageType(socket, 'run:history');
    const payload = (message as { payload: { featureId: string; runs: unknown[] } }).payload;
    expect(payload.featureId).toBe('feat-1');
    expect(payload.runs).toHaveLength(1);
    expect(mocks.listRunHistoryForFeature).toHaveBeenCalledWith('repo-1', 'feat-1');

    socket.close();
  });

  // F34 item 2: run changes over WebSocket and HTTP, with git-unavailable fallback.
  // These pass `cwd` explicitly instead of relying on the ambient
  // process.cwd() set by beforeEach's process.chdir() — that global mutates
  // process-wide state, which races against other test files under
  // vitest's threaded pool and can point computeRunChanges' `git` calls at
  // the real project repo instead of the empty tmp dir.
  it('reports no git repository for a run:changes subscription outside a git repo', async () => {
    const { createWebServer } = await import('../../src/web/server.js');

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret', cwd });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    socket.send(JSON.stringify({ type: 'subscribe:runChanges', runId: 42 }));
    const message = await waitForMessageType(socket, 'run:changes');
    const payload = (message as { payload: { runId: number; files: unknown[]; notApplicableReason: string | null } }).payload;
    expect(payload.runId).toBe(42);
    expect(payload.files).toEqual([]);
    expect(payload.notApplicableReason).toBe("No git repository detected for this run's working directory.");

    socket.close();
  });

  it('serves /api/runs/:runId/changes over HTTP with the same git fallback', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret', cwd });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(`${base}/api/runs/42/changes`, { headers: { Authorization: 'Bearer secret' } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { runId: number; notApplicableReason: string | null };
    expect(json.runId).toBe(42);
    expect(json.notApplicableReason).toBe("No git repository detected for this run's working directory.");
  });

  it('rejects /api/runs/:runId/changes without a token', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(`${base}/api/runs/42/changes`);
    expect(res.status).toBe(401);
  });

  // F34 item 6: theme snapshot in full state
  it('includes a theme snapshot with a default fallback in full state', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(`${base}/api/state`, { headers: { Authorization: 'Bearer secret' } });
    const json = (await res.json()) as { theme: { name: string; roles: Record<string, string> } };
    expect(json.theme.name).toBe('default');
    expect(json.theme.roles.text).toBeTruthy();
    expect(json.theme.roles.error).toBeTruthy();
  });

  it('persists a feature config patch and broadcasts state:full on success', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.updateCatalogFeature.mockReturnValue({ id: 'feat1', effort: 'high' });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    socket.send(JSON.stringify({
      type: 'action:updateFeatureConfig',
      featureId: 'feat1',
      patch: { effort: 'high', maxTokens: 5000 },
    }));

    const stateMessage = await waitForMessageType(socket, 'state:full');
    expect(mocks.updateCatalogFeature).toHaveBeenCalledWith(
      'repo-1',
      'feat1',
      expect.objectContaining({ effort: 'high', maxTokens: 5000 }),
    );
    expect((stateMessage as { type: string }).type).toBe('state:full');

    socket.close();
  });

  it('emits ui:notice without throwing when the feature config patch fails', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.updateCatalogFeature.mockImplementation(() => {
      throw new Error('Feature "nope" not found (or archived) for repo "repo-1".');
    });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    socket.send(JSON.stringify({
      type: 'action:updateFeatureConfig',
      featureId: 'nope',
      patch: { effort: 'high' },
    }));

    const notice = await waitForMessageType(socket, 'ui:notice');
    expect((notice as { payload: { message: string } }).payload.message).toContain('nope');

    socket.close();
  });

  it('persists a task config patch and broadcasts state:full on success', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.updateCatalogTask.mockReturnValue({ id: 'task-1', status: 'done' });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    socket.send(JSON.stringify({
      type: 'action:updateTaskConfig',
      featureId: 'feat1',
      taskId: 'task-1',
      patch: { status: 'done' },
    }));

    const stateMessage = await waitForMessageType(socket, 'state:full');
    expect(mocks.updateCatalogTask).toHaveBeenCalledWith('feat1', 'task-1', { status: 'done' });
    expect((stateMessage as { type: string }).type).toBe('state:full');

    socket.close();
  });

  it('emits ui:notice without throwing when the task config patch fails', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.updateCatalogTask.mockImplementation(() => {
      throw new Error('Task "nope" not found (or archived) for feature "feat1".');
    });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    socket.send(JSON.stringify({
      type: 'action:updateTaskConfig',
      featureId: 'feat1',
      taskId: 'nope',
      patch: { status: 'done' },
    }));

    const notice = await waitForMessageType(socket, 'ui:notice');
    expect((notice as { payload: { message: string } }).payload.message).toContain('nope');

    socket.close();
  });
});
