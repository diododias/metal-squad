import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const mocks = vi.hoisted(() => ({
  resolveRepo: vi.fn(),
  listRunsForTui: vi.fn(),
  listRunHistoryForFeature: vi.fn(),
  getRunSessionStatus: vi.fn(),
  listRunToolCalls: vi.fn(),
  openGates: vi.fn(),
  listPendingStageRequests: vi.fn(),
  listRunningTaskRuns: vi.fn(),
  listRunsForStats: vi.fn(),
  listPendingTimeoutApprovalRequests: vi.fn(),
  getProjectStateRevision: vi.fn(),
  listProjectStateSummaries: vi.fn(),
  listRepositoryStateSummaries: vi.fn(),
  listEpics: vi.fn(),
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
  listCompletedFeatureIds: vi.fn(() => new Set()),
  getPendingFeatures: vi.fn(() => []),
  computeRunBreakdown: vi.fn(),
  assertWritableDbPath: vi.fn(),
  updateCatalogFeature: vi.fn(),
  updateCatalogTask: vi.fn(),
  updateCatalogDefaults: vi.fn(),
  loadBacklogFromCatalog: vi.fn(),
  validateBacklogSkills: vi.fn(),
  loadConfig: vi.fn(),
  resolveRuntimeConfig: vi.fn(),
  saveConfig: vi.fn(),
  saveNotificationsPatch: vi.fn(),
  saveAppConfigPatch: vi.fn(),
  setSecret: vi.fn(),
  clearSecret: vi.fn(),
  parseConfig: vi.fn((value) => value),
  spawn: vi.fn(),
  getPipeline: vi.fn(),
  getAdapter: vi.fn(),
  projectService: {
    create: vi.fn(),
    update: vi.fn(),
  },
  epicService: {
    create: vi.fn(),
    update: vi.fn(),
  },
  workItemService: {
    create: vi.fn(),
  },
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
  updateCatalogDefaults: mocks.updateCatalogDefaults,
}));

vi.mock('../../src/core/backlog/load.js', () => ({
  loadBacklogFromCatalog: mocks.loadBacklogFromCatalog,
}));

vi.mock('../../src/core/skills/index.js', () => ({
  validateBacklogSkills: mocks.validateBacklogSkills,
}));

vi.mock('../../src/config/index.js', () => ({
  CONFIG_DIR: '/tmp',
  DATA_DIR: '/tmp',
  DB_PATH_ENV: 'MSQ_DB_PATH',
  resolveDbPath: () => '/tmp/metal-squad-web-test.db',
  loadConfig: mocks.loadConfig,
  resolveRuntimeConfig: mocks.resolveRuntimeConfig,
  saveConfig: mocks.saveConfig,
  saveNotificationsPatch: mocks.saveNotificationsPatch,
  saveAppConfigPatch: mocks.saveAppConfigPatch,
  ConfigSchema: { parse: mocks.parseConfig },
}));

vi.mock('../../src/security/secrets.js', () => ({
  setSecret: mocks.setSecret,
  clearSecret: mocks.clearSecret,
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawn: mocks.spawn,
  };
});

vi.mock('../../src/db/repo.js', () => ({
  listRunsForTui: mocks.listRunsForTui,
  listRunHistoryForFeature: mocks.listRunHistoryForFeature,
  getRunSessionStatus: mocks.getRunSessionStatus,
  listRunToolCalls: mocks.listRunToolCalls,
  openGates: mocks.openGates,
  listPendingStageRequests: mocks.listPendingStageRequests,
  listRunningTaskRuns: mocks.listRunningTaskRuns,
  listRunsForStats: mocks.listRunsForStats,
  listPendingTimeoutApprovalRequests: mocks.listPendingTimeoutApprovalRequests,
  getProjectStateRevision: mocks.getProjectStateRevision,
  listProjectStateSummaries: mocks.listProjectStateSummaries,
  listRepositoryStateSummaries: mocks.listRepositoryStateSummaries,
  listEpics: mocks.listEpics,
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
  listCompletedFeatureIds: mocks.listCompletedFeatureIds,
  getPipeline: mocks.getPipeline,
}));

vi.mock('../../src/core/adapters/index.js', () => ({
  getAdapter: mocks.getAdapter,
}));

vi.mock('../../src/core/projectService.js', () => ({
  projectService: mocks.projectService,
}));

vi.mock('../../src/core/epicService.js', () => ({
  epicService: mocks.epicService,
}));

vi.mock('../../src/core/workItemService.js', () => ({
  workItemService: mocks.workItemService,
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

async function waitForMatchingMessage(
  socket: WebSocket,
  matcher: (message: Record<string, unknown>) => boolean,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for matching WebSocket message')), timeoutMs);
    const handler = (data: WebSocket.RawData): void => {
      try {
        const message = JSON.parse(data.toString('utf8')) as Record<string, unknown>;
        if (matcher(message)) {
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

function projectEntity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projectId: 'project-1',
    name: 'Web Project',
    description: null,
    position: 0,
    archivedAt: null,
    deletedAt: null,
    revision: 1,
    createdAt: '2026-07-18T12:00:00.000Z',
    updatedAt: '2026-07-18T12:00:00.000Z',
    ...overrides,
  };
}

function epicEntity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    epicId: 'epic-1',
    projectId: 'project-1',
    repoId: null,
    title: 'Web Epic',
    description: null,
    status: 'todo',
    position: 0,
    archivedAt: null,
    deletedAt: null,
    revision: 1,
    createdAt: '2026-07-18T12:00:00.000Z',
    updatedAt: '2026-07-18T12:00:00.000Z',
    ...overrides,
  };
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
    mocks.listPendingTimeoutApprovalRequests.mockReturnValue([]);
    mocks.getProjectStateRevision.mockReturnValue(0);
    mocks.listProjectStateSummaries.mockReturnValue([]);
    mocks.listRepositoryStateSummaries.mockReturnValue([]);
    mocks.listEpics.mockReturnValue([]);
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
    mocks.loadBacklogFromCatalog.mockReturnValue({ epics: [] });
    mocks.validateBacklogSkills.mockReturnValue(undefined);
    mocks.loadConfig.mockReturnValue({
      concurrency: 3,
      staleRunThresholdMinutes: 120,
      toolTimeoutMs: 600_000,
      idleThresholdMs: 30_000,
      promptContextCharLimit: 20_000,
      stageSkills: {},
      notifications: { channels: [], events: [] },
      workflow: { autoAdvanceStages: false, pollIntervalMs: 2_000 },
      budget: { alertAtPercent: 80 },
      web: { host: '127.0.0.1', port: 8743, auth: 'token' },
    });
    mocks.resolveRuntimeConfig.mockReturnValue({
      concurrency: 3,
      staleRunThresholdMinutes: 120,
      toolTimeoutMs: 600_000,
      promptContextCharLimit: 20_000,
      theme: undefined,
      stageSkills: {},
      notifications: { channels: [], events: [] },
      workflow: { autoAdvanceStages: false, pollIntervalMs: 2_000 },
      budget: { alertAtPercent: 80 },
      web: { host: '127.0.0.1', port: 8743, auth: 'token' },
    });
    mocks.spawn.mockReturnValue({
      once: vi.fn(),
      unref: vi.fn(),
    });
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

  it('broadcasts run:blocked events to authenticated clients', async () => {
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

    msqEventBus.emit('run:blocked', {
      runId: 7,
      featureId: 'feat-1',
      tool: 'claude',
      reason: 'gate',
      code: 'dependency_unavailable',
      summary: 'aguardando decisão humana',
    });
    const message = await waitForSocketMessage(socket);
    expect((message as { type: string }).type).toBe('run:blocked');
    expect((message as { payload: { reason: string } }).payload.reason).toBe('gate');
    expect((message as { payload: { code?: string } }).payload.code).toBe('dependency_unavailable');
    socket.close();
  });

  it('broadcasts autopilot:decision events to authenticated clients', async () => {
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

    msqEventBus.emit('autopilot:decision', {
      triggerFeatureId: 'feat-1',
      triggerRunId: 7,
      triggerKind: 'success',
      action: 'start',
      selectedFeatureId: 'feat-2',
      reason: 'Starting next eligible autoStart feature: feat-2.',
    });
    const message = await waitForSocketMessage(socket);
    expect((message as { type: string }).type).toBe('autopilot:decision');
    expect((message as { payload: { action: string; selectedFeatureId: string } }).payload).toMatchObject({
      action: 'start',
      selectedFeatureId: 'feat-2',
    });
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

  it('returns a create result only to the initiating client and publishes reconciled state', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    const created = projectEntity({ description: 'Created through WebSocket' });
    mocks.projectService.create.mockReturnValue({ entity: created, revision: 1 });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const origin = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    const peer = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await Promise.all([waitForOpen(origin), waitForOpen(peer)]);
    origin.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    peer.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await Promise.all([waitForSocketMessage(origin), waitForSocketMessage(peer)]);

    let peerReceivedActionResult = false;
    const onPeerMessage = (data: WebSocket.RawData): void => {
      if ((JSON.parse(data.toString('utf8')) as { type?: string }).type === 'action:result') peerReceivedActionResult = true;
    };
    peer.on('message', onPeerMessage);
    const resultPromise = waitForMatchingMessage(
      origin,
      (message) => message.type === 'action:result' && (message.payload as { requestId?: string }).requestId === 'create-1',
    );
    const peerStatePromise = waitForMessageType(peer, 'state:full');
    origin.send(JSON.stringify({
      type: 'action:createProject',
      requestId: 'create-1',
      name: '  Web Project  ',
      description: 'Created through WebSocket',
    }));

    expect(await resultPromise).toEqual({
      type: 'action:result',
      payload: { requestId: 'create-1', ok: true, entity: created },
    });
    await peerStatePromise;
    peer.off('message', onPeerMessage);
    expect(peerReceivedActionResult).toBe(false);
    expect(mocks.projectService.create).toHaveBeenCalledWith({
      name: '  Web Project  ',
      description: 'Created through WebSocket',
    });
    origin.close();
    peer.close();
  });

  it('rejects invalid Project action payloads before calling the service', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    const rejected = waitForMatchingMessage(socket, (message) => message.type === 'action:result');
    socket.send(JSON.stringify({
      type: 'action:updateProject',
      requestId: 'invalid-1',
      projectId: 'project-1',
      expectedRevision: 1,
      patch: { unexpected: 'not allowed' },
    }));

    expect(await rejected).toEqual({
      type: 'action:result',
      payload: {
        requestId: 'invalid-1',
        ok: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Invalid project action payload.' },
      },
    });
    expect(mocks.projectService.create).not.toHaveBeenCalled();
    expect(mocks.projectService.update).not.toHaveBeenCalled();
    socket.close();
  });

  it('returns a stable revision conflict after a stale Project update', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    const updated = projectEntity({ name: 'Current', revision: 2 });
    mocks.projectService.update
      .mockReturnValueOnce({ entity: updated, revision: 2 })
      .mockImplementationOnce(() => { throw { code: 'REVISION_CONFLICT', message: 'database revision detail' }; });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    const accepted = waitForMatchingMessage(
      socket,
      (message) => message.type === 'action:result' && (message.payload as { requestId?: string }).requestId === 'update-1',
    );
    socket.send(JSON.stringify({
      type: 'action:updateProject', requestId: 'update-1', projectId: 'project-1', expectedRevision: 1, patch: { name: 'Current' },
    }));
    expect(await accepted).toEqual({
      type: 'action:result',
      payload: { requestId: 'update-1', ok: true, entity: updated },
    });

    const conflict = waitForMatchingMessage(
      socket,
      (message) => message.type === 'action:result' && (message.payload as { requestId?: string }).requestId === 'update-2',
    );
    socket.send(JSON.stringify({
      type: 'action:updateProject', requestId: 'update-2', projectId: 'project-1', expectedRevision: 1, patch: { description: 'stale' },
    }));
    expect(await conflict).toEqual({
      type: 'action:result',
      payload: {
        requestId: 'update-2',
        ok: false,
        error: { code: 'REVISION_CONFLICT', message: 'Project was changed by another request. Refresh and try again.' },
      },
    });
    expect(mocks.projectService.update).toHaveBeenNthCalledWith(1, 'project-1', { name: 'Current' }, 1);
    expect(mocks.projectService.update).toHaveBeenNthCalledWith(2, 'project-1', { description: 'stale' }, 1);
    socket.close();
  });

  it('returns an Epic create result only to the initiating client and publishes reconciled state', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    const created = epicEntity({ description: 'Created through WebSocket' });
    mocks.epicService.create.mockReturnValue({ entity: created, revision: 1 });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const origin = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    const peer = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await Promise.all([waitForOpen(origin), waitForOpen(peer)]);
    origin.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    peer.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await Promise.all([waitForSocketMessage(origin), waitForSocketMessage(peer)]);

    let peerReceivedActionResult = false;
    const onPeerMessage = (data: WebSocket.RawData): void => {
      if ((JSON.parse(data.toString('utf8')) as { type?: string }).type === 'action:result') peerReceivedActionResult = true;
    };
    peer.on('message', onPeerMessage);
    const resultPromise = waitForMatchingMessage(
      origin,
      (message) => message.type === 'action:result' && (message.payload as { requestId?: string }).requestId === 'epic-create-1',
    );
    const peerStatePromise = waitForMessageType(peer, 'state:full');
    origin.send(JSON.stringify({
      type: 'action:createEpic',
      requestId: 'epic-create-1',
      projectId: 'project-1',
      title: '  Web Epic  ',
      description: 'Created through WebSocket',
    }));

    expect(await resultPromise).toEqual({
      type: 'action:result',
      payload: { requestId: 'epic-create-1', ok: true, entity: created },
    });
    await peerStatePromise;
    peer.off('message', onPeerMessage);
    expect(peerReceivedActionResult).toBe(false);
    expect(mocks.epicService.create).toHaveBeenCalledWith({
      projectId: 'project-1',
      title: '  Web Epic  ',
      description: 'Created through WebSocket',
      audit: { actor: 'web', requestId: 'epic-create-1' },
    });
    origin.close();
    peer.close();
  });

  it('uses createWorkItem/workItemId as the WebSocket contract and reemits state', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    const workItem = {
      workItemId: 'F-23456789', epicId: 'epic-1', repoId: 'repo-1', title: 'Web Work Item',
      description: null, type: 'feature', dependsOn: [], tasks: [], tool: 'codex', effort: 'medium', thinking: 'off',
      skills: [], workflow: { mode: 'staged', stages: ['plan'], approvals: { channel: 'telegram' }, autoAdvance: false, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] }, stepGuidance: {}, stagePublishes: {} },
      autoStart: false, revision: 1, createdAt: '2026-07-18T12:00:00.000Z', updatedAt: '2026-07-18T12:00:00.000Z',
    };
    mocks.workItemService.create.mockReturnValue({ entity: workItem, revision: 1 });
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    const result = waitForMatchingMessage(socket, (message) => message.type === 'action:result');
    socket.send(JSON.stringify({ type: 'action:createWorkItem', requestId: 'work-item-1', epicId: 'epic-1', repoId: 'repo-1', title: 'Web Work Item' }));

    expect(await result).toEqual({ type: 'action:result', payload: { requestId: 'work-item-1', ok: true, workItem, revision: 1 } });
    expect(mocks.workItemService.create).toHaveBeenCalledWith({
      epicId: 'epic-1', repoId: 'repo-1', title: 'Web Work Item', description: undefined, dependsOn: undefined,
      audit: { actor: 'web', requestId: 'work-item-1' },
    });
    socket.close();
  });

  it('rejects invalid Epic action payloads before calling the service', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    const rejected = waitForMatchingMessage(socket, (message) => message.type === 'action:result');
    socket.send(JSON.stringify({
      type: 'action:updateEpic',
      requestId: 'epic-invalid-1',
      epicId: 'epic-1',
      expectedRevision: 1,
      patch: { status: 'derived-from-runs' },
    }));

    expect(await rejected).toEqual({
      type: 'action:result',
      payload: {
        requestId: 'epic-invalid-1',
        ok: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Invalid epic action payload.' },
      },
    });
    expect(mocks.epicService.create).not.toHaveBeenCalled();
    expect(mocks.epicService.update).not.toHaveBeenCalled();
    socket.close();
  });

  it('returns a stable revision conflict after a stale Epic update', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    const updated = epicEntity({ status: 'in_progress', revision: 2 });
    mocks.epicService.update
      .mockReturnValueOnce({ entity: updated, revision: 2 })
      .mockImplementationOnce(() => { throw { code: 'REVISION_CONFLICT', message: 'database revision detail' }; });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    const accepted = waitForMatchingMessage(
      socket,
      (message) => message.type === 'action:result' && (message.payload as { requestId?: string }).requestId === 'epic-update-1',
    );
    socket.send(JSON.stringify({
      type: 'action:updateEpic', requestId: 'epic-update-1', epicId: 'epic-1', expectedRevision: 1, patch: { status: 'in_progress' },
    }));
    expect(await accepted).toEqual({
      type: 'action:result',
      payload: { requestId: 'epic-update-1', ok: true, entity: updated },
    });

    const conflict = waitForMatchingMessage(
      socket,
      (message) => message.type === 'action:result' && (message.payload as { requestId?: string }).requestId === 'epic-update-2',
    );
    socket.send(JSON.stringify({
      type: 'action:updateEpic', requestId: 'epic-update-2', epicId: 'epic-1', expectedRevision: 1, patch: { title: 'stale' },
    }));
    expect(await conflict).toEqual({
      type: 'action:result',
      payload: {
        requestId: 'epic-update-2',
        ok: false,
        error: { code: 'REVISION_CONFLICT', message: 'Epic was changed by another request. Refresh and try again.' },
      },
    });
    expect(mocks.epicService.update).toHaveBeenNthCalledWith(
      1,
      'epic-1',
      { status: 'in_progress' },
      1,
      { audit: { actor: 'web', requestId: 'epic-update-1' } },
    );
    expect(mocks.epicService.update).toHaveBeenNthCalledWith(
      2,
      'epic-1',
      { title: 'stale' },
      1,
      { audit: { actor: 'web', requestId: 'epic-update-2' } },
    );
    socket.close();
  });

  it('rejects Project mutations before authentication', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'action:createProject', requestId: 'unauthorized-1', name: 'Nope' }));
    await waitForClose(socket);
    expect(mocks.projectService.create).not.toHaveBeenCalled();
  });

  it('includes featureCatalog and backlogSettings in full state', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.getFeatureCatalog.mockReturnValue({
      feat1: { id: 'feat1', title: 'Feature One', tool: 'claude', effort: 'M', skills: [], dependsOn: [], workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } } },
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

  it('persists tool and model config patches and broadcasts state:full on success', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.updateCatalogFeature.mockReturnValue({ id: 'feat1', tool: 'codex', model: 'gpt-5.6' });

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
      patch: { tool: 'codex', model: 'gpt-5.6' },
    }));

    const stateMessage = await waitForMessageType(socket, 'state:full');
    expect(mocks.updateCatalogFeature).toHaveBeenCalledWith(
      'repo-1',
      'feat1',
      { tool: 'codex', model: 'gpt-5.6' },
    );
    expect((stateMessage as { type: string }).type).toBe('state:full');

    socket.close();
  });

  it('acknowledges an accepted stages-only workflow reorder patch to its initiating client before reconciling state', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.updateCatalogFeature.mockReturnValue({ id: 'feat1' });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    const saveResult = waitForMessageType(socket, 'featureConfig:saveResult');
    const reconciledState = waitForMessageType(socket, 'state:full');
    socket.send(JSON.stringify({
      type: 'action:updateFeatureConfig',
      featureId: 'feat1',
      patch: { workflow: { stages: ['plan', 'specify', 'implement'] } },
    }));

    expect(await saveResult).toMatchObject({
      payload: { featureId: 'feat1', ok: true },
    });
    await reconciledState;
    expect(mocks.updateCatalogFeature).toHaveBeenCalledWith('repo-1', 'feat1', {
      workflow: { stages: ['plan', 'specify', 'implement'] },
    });
    socket.close();
  });

  it('forwards a workflow isolation cleanup patch through the narrow config action', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.updateCatalogFeature.mockReturnValue({ id: 'feat1' });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    const saveResult = waitForMessageType(socket, 'featureConfig:saveResult');
    socket.send(JSON.stringify({
      type: 'action:updateFeatureConfig',
      featureId: 'feat1',
      patch: {
        workflow: {
          stages: ['specify', 'validate'],
          stepGuidance: { validate: { prompt: 'Keep this.' } },
          sessionPolicy: { alwaysIsolatedStages: ['validate'] },
        },
      },
    }));

    expect(await saveResult).toMatchObject({ payload: { featureId: 'feat1', ok: true } });
    expect(mocks.updateCatalogFeature).toHaveBeenCalledWith('repo-1', 'feat1', {
      workflow: {
        stages: ['specify', 'validate'],
        stepGuidance: { validate: { prompt: 'Keep this.' } },
        sessionPolicy: { alwaysIsolatedStages: ['validate'] },
      },
    });
    socket.close();
  });

  it('persists an autoStart patch through action:updateFeatureConfig', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.updateCatalogFeature.mockReturnValue({ id: 'feat1', autoStart: true });

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
      patch: { autoStart: true },
    }));

    await waitForMessageType(socket, 'state:full');
    expect(mocks.updateCatalogFeature).toHaveBeenCalledWith(
      'repo-1',
      'feat1',
      expect.objectContaining({ autoStart: true }),
    );

    socket.close();
  });

  it('persists a specification patch through action:updateFeatureConfig', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.updateCatalogFeature.mockReturnValue({ id: 'feat1', spec: '# Updated specification' });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    socket.send(JSON.stringify({
      type: 'action:updateFeatureConfig',
      featureId: 'feat1',
      patch: { spec: '# Updated specification' },
    }));

    await waitForMessageType(socket, 'state:full');
    expect(mocks.updateCatalogFeature).toHaveBeenCalledWith(
      'repo-1',
      'feat1',
      expect.objectContaining({ spec: '# Updated specification' }),
    );

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

  it('returns stable workflow issues without reconciling state when a config save is rejected', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    const error = Object.assign(new Error('Invalid workflow'), {
      issues: [{ path: ['workflow', 'approvals', 'channel'], message: 'Invalid enum value.' }],
    });
    mocks.updateCatalogFeature.mockImplementation(() => { throw error; });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    socket.send(JSON.stringify({
      type: 'action:updateFeatureConfig',
      featureId: 'feat1',
      patch: { workflow: { approvals: { channel: 'telegram' } } },
    }));

    expect(await waitForMessageType(socket, 'featureConfig:saveResult')).toMatchObject({
      payload: {
        featureId: 'feat1',
        ok: false,
        issues: [{ message: 'Approval channel "telegram" is not configured or has no credentials.' }],
      },
    });
    expect(mocks.updateCatalogFeature).not.toHaveBeenCalled();
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

  it('persists a project defaults patch and broadcasts state:full on success', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.updateCatalogDefaults.mockReturnValue({ defaults: { tool: 'codex', effort: 'high', skills: [], stageSkills: {} } });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    socket.send(JSON.stringify({
      type: 'action:updateProjectDefaults',
      patch: { tool: 'codex', effort: 'high' },
    }));

    const stateMessage = await waitForMessageType(socket, 'state:full');
    expect(mocks.updateCatalogDefaults).toHaveBeenCalledWith('repo-1', { tool: 'codex', effort: 'high' });
    expect((stateMessage as { type: string }).type).toBe('state:full');

    socket.close();
  });

  it('emits ui:notice without throwing when the project defaults patch fails', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    mocks.updateCatalogDefaults.mockImplementation(() => {
      throw new Error('Catalog defaults not found for repo "repo-1".');
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
      type: 'action:updateProjectDefaults',
      patch: { tool: 'codex' },
    }));

    const notice = await waitForMessageType(socket, 'ui:notice');
    expect((notice as { payload: { message: string } }).payload.message).toContain('repo-1');

    socket.close();
  });

  it('persists a valid App budget alert to global config.json', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    socket.send(JSON.stringify({ type: 'action:updateBudgetConfig', patch: { alertAtPercent: 0 } }));

    await waitForMessageType(socket, 'state:full');
    expect(mocks.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ budget: { alertAtPercent: 0 } }));
    socket.close();
  });

  it('rejects an invalid App budget alert without writing global config.json', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    socket.send(JSON.stringify({ type: 'action:updateBudgetConfig', patch: { alertAtPercent: 101 } }));

    const notice = await waitForMessageType(socket, 'ui:notice');
    expect((notice as { payload: { message: string } }).payload.message).toContain('whole number between 0 and 100');
    expect(mocks.saveConfig).not.toHaveBeenCalled();
    socket.close();
  });

  it('persists a write-only notification patch and refreshes state', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    socket.send(JSON.stringify({
      type: 'action:updateNotifications',
      patch: { channels: [{ type: 'webhook', url: 'https://example.test/new-secret' }], events: ['run:done'] },
    }));

    await waitForMessageType(socket, 'state:full');
    expect(mocks.saveNotificationsPatch).toHaveBeenCalledWith({
      channels: [{ type: 'webhook', url: 'https://example.test/new-secret' }],
      events: ['run:done'],
    });
    socket.close();
  });

  it('persists a complete App tool registry and broadcasts refreshed state', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    const tool = {
      id: 'codex-canary', adapter: 'codex', command: 'codex-canary', baseArgs: [], env: {}, versionCheck: ['--version'],
      capabilities: { model: true, effort: true, thinking: false }, thinkingBudget: { low: 0, medium: 0, high: 0 }, minTimeoutMs: 0,
    };
    mocks.loadConfig.mockReturnValue({ concurrency: 3 });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    socket.send(JSON.stringify({ type: 'action:updateToolsRegistry', tools: [tool] }));

    const stateMessage = await waitForMessageType(socket, 'state:full');
    expect(mocks.saveConfig).toHaveBeenCalledWith({ concurrency: 3, tools: [tool] });
    expect((stateMessage as { type: string }).type).toBe('state:full');
    socket.close();
  });

  it('rebroadcasts refreshed state:full and run:detail after run-control actions', async () => {
    const { createWebServer } = await import('../../src/web/server.js');

    let currentRun = {
      runId: 42,
      repoId: 'repo-1',
      featureId: 'feat-1',
      tool: 'codex',
      pipelineId: 99,
      stage: 'implement',
      rawStatus: 'running',
      status: 'running',
      startedAt: '2026-07-11T10:00:00.000Z',
      endedAt: null,
      totalTokens: 100,
      inputTokens: 50,
      outputTokens: 50,
      gateId: null,
      gateDecision: null,
      pipelineStatus: 'running',
      pipelineCurrentStage: 'implement',
      pipelineResumeSummary: null,
      pendingStageRequestId: null,
      pendingStageRequestKind: null,
      pendingStageRequestPrompt: null,
      pendingStageRequestCreatedAt: null,
    };
    let taskStatus = 'running';
    mocks.listRunsForTui.mockImplementation(() => [currentRun]);
    mocks.listTaskRunsForRun.mockImplementation(() => [
      { id: 1, runId: 42, taskId: 'task-1', title: 'Task one', status: taskStatus, stage: 'implement', startedAt: null, endedAt: null },
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
    await waitForMessageType(socket, 'run:detail');

    currentRun = { ...currentRun, status: 'blocked', pipelineStatus: 'paused' };
    taskStatus = 'blocked';
    const pausedStatePromise = waitForMatchingMessage(
      socket,
      (message) => message.type === 'state:full' && Array.isArray((message.payload as { runs?: unknown[] }).runs)
        && ((message.payload as { runs: Array<{ status: string }> }).runs[0]?.status === 'blocked'),
    );
    const pausedDetailPromise = waitForMessageType(socket, 'run:detail');
    socket.send(JSON.stringify({ type: 'action:pausePipeline', pipelineId: 99 }));
    await vi.waitFor(() => expect(mocks.pausePipeline).toHaveBeenCalledWith(99));
    const pausedState = await pausedStatePromise;
    expect((pausedState.payload as { runs: Array<{ pipelineStatus: string }> }).runs[0]?.pipelineStatus).toBe('paused');
    const pausedDetail = await pausedDetailPromise;
    expect((pausedDetail as { payload: { taskRuns: Array<{ status: string }> } }).payload.taskRuns[0]?.status).toBe('blocked');

    currentRun = { ...currentRun, status: 'running', pipelineStatus: 'running' };
    taskStatus = 'running';
    const resumedStatePromise = waitForMatchingMessage(
      socket,
      (message) => message.type === 'state:full'
        && ((message.payload as { runs: Array<{ status: string }> }).runs[0]?.status === 'running'),
    );
    const resumedDetailPromise = waitForMessageType(socket, 'run:detail');
    socket.send(JSON.stringify({ type: 'action:resumePipeline', pipelineId: 99 }));
    await vi.waitFor(() => expect(mocks.resumePipeline).toHaveBeenCalledWith(99));
    const resumedState = await resumedStatePromise;
    expect((resumedState.payload as { runs: Array<{ pipelineStatus: string }> }).runs[0]?.pipelineStatus).toBe('running');
    const resumedDetail = await resumedDetailPromise;
    expect((resumedDetail as { payload: { taskRuns: Array<{ status: string }> } }).payload.taskRuns[0]?.status).toBe('running');

    currentRun = { ...currentRun, status: 'aborted', pipelineStatus: 'aborting' };
    taskStatus = 'failed';
    const abortedStatePromise = waitForMatchingMessage(
      socket,
      (message) => message.type === 'state:full'
        && ((message.payload as { runs: Array<{ status: string }> }).runs[0]?.status === 'aborted'),
    );
    const abortedDetailPromise = waitForMessageType(socket, 'run:detail');
    socket.send(JSON.stringify({ type: 'action:abortPipeline', pipelineId: 99 }));
    await vi.waitFor(() => expect(mocks.abortPipeline).toHaveBeenCalledWith(99));
    const abortedState = await abortedStatePromise;
    expect((abortedState.payload as { runs: Array<{ pipelineStatus: string }> }).runs[0]?.pipelineStatus).toBe('aborting');
    const abortedDetail = await abortedDetailPromise;
    expect((abortedDetail as { payload: { taskRuns: Array<{ status: string }> } }).payload.taskRuns[0]?.status).toBe('failed');

    currentRun = { ...currentRun, status: 'blocked', pipelineStatus: 'paused' };
    taskStatus = 'blocked';
    const requestedAbortStatePromise = waitForMatchingMessage(
      socket,
      (message) => message.type === 'state:full'
        && ((message.payload as { runs: Array<{ pipelineStatus: string }> }).runs[0]?.pipelineStatus === 'paused'),
    );
    const requestedAbortDetailPromise = waitForMessageType(socket, 'run:detail');
    socket.send(JSON.stringify({ type: 'action:requestFeatureAbort', pipelineId: 99, featureId: 'feat-1' }));
    await vi.waitFor(() => expect(mocks.requestFeatureAbort).toHaveBeenCalledWith(99, 'feat-1'));
    const requestedAbortState = await requestedAbortStatePromise;
    expect((requestedAbortState.payload as { runs: Array<{ status: string }> }).runs[0]?.status).toBe('blocked');
    const requestedAbortDetail = await requestedAbortDetailPromise;
    expect((requestedAbortDetail as { payload: { taskRuns: Array<{ status: string }> } }).payload.taskRuns[0]?.status).toBe('blocked');

    socket.close();
  });

  it('refreshes state, history, and changes subscriptions after blocker resolution', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    const { execFileSync } = await import('node:child_process');
    const { writeFileSync } = await import('node:fs');

    // Strip GIT_* env vars (GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE/...) so this
    // fixture repo isn't hijacked by an ancestor git process — e.g. when this
    // suite runs under the repo's own pre-commit hook, git sets these to
    // point at the *outer* repo, and without stripping them, every git call
    // below would silently operate on it instead of `cwd`. See src/web/server.ts
    // GIT_ENV_OVERRIDE for the same workaround in production code.
    const gitEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
    );
    execFileSync('git', ['init'], { cwd, stdio: 'ignore', env: gitEnv });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd, stdio: 'ignore', env: gitEnv });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd, stdio: 'ignore', env: gitEnv });
    writeFileSync(join(cwd, 'tracked.txt'), 'base\n');
    execFileSync('git', ['add', 'tracked.txt'], { cwd, stdio: 'ignore', env: gitEnv });
    execFileSync('git', ['commit', '-m', 'init'], { cwd, stdio: 'ignore', env: gitEnv });

    let currentRun = {
      runId: 42,
      repoId: 'repo-1',
      featureId: 'feat-1',
      tool: 'codex',
      pipelineId: 99,
      stage: 'implement',
      rawStatus: 'blocked',
      status: 'blocked',
      startedAt: '2026-07-11T10:00:00.000Z',
      endedAt: null,
      totalTokens: 100,
      inputTokens: 50,
      outputTokens: 50,
      gateId: 7,
      gateDecision: null,
      pipelineStatus: 'blocked',
      pipelineCurrentStage: 'implement',
      pipelineResumeSummary: null,
      pendingStageRequestId: null,
      pendingStageRequestKind: null,
      pendingStageRequestPrompt: null,
      pendingStageRequestCreatedAt: null,
    };
    let history = [
      { runId: 42, repoId: 'repo-1', featureId: 'feat-1', tool: 'codex', stage: 'implement', status: 'blocked', startedAt: '2026-07-11T10:00:00.000Z', endedAt: null, totalTokens: 100, pipelineResumeSummary: null },
    ];
    mocks.listRunsForTui.mockImplementation(() => [currentRun]);
    mocks.listRunHistoryForFeature.mockImplementation(() => history);

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret', cwd });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    socket.send(JSON.stringify({ type: 'subscribe:runHistory', featureId: 'feat-1' }));
    await waitForMessageType(socket, 'run:history');
    socket.send(JSON.stringify({ type: 'subscribe:runChanges', runId: 42 }));
    await waitForMessageType(socket, 'run:changes');

    writeFileSync(join(cwd, 'tracked.txt'), 'base\nchanged\n');
    currentRun = { ...currentRun, status: 'running', gateId: null, pipelineStatus: 'running' };
    history = [
      { runId: 42, repoId: 'repo-1', featureId: 'feat-1', tool: 'codex', stage: 'implement', status: 'running', startedAt: '2026-07-11T10:00:00.000Z', endedAt: null, totalTokens: 100, pipelineResumeSummary: null },
    ];

    const stateMessagePromise = waitForMatchingMessage(
      socket,
      (message) => message.type === 'state:full'
        && ((message.payload as { runs: Array<{ gateId: number | null }> }).runs[0]?.gateId === null),
    );
    const historyMessagePromise = waitForMessageType(socket, 'run:history');
    const changesMessagePromise = waitForMessageType(socket, 'run:changes');
    socket.send(JSON.stringify({ type: 'action:forceResolveGate', gateId: 7 }));
    await vi.waitFor(() => expect(mocks.forceResolveGate).toHaveBeenCalledWith(7));
    const stateMessage = await stateMessagePromise;
    expect((stateMessage.payload as { runs: Array<{ status: string }> }).runs[0]?.status).toBe('running');
    const historyMessage = await historyMessagePromise;
    expect((historyMessage as { payload: { runs: Array<{ status: string }> } }).payload.runs[0]?.status).toBe('running');
    const changesMessage = await changesMessagePromise;
    expect((changesMessage as { payload: { files: Array<{ path: string }> } }).payload.files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'tracked.txt' })]),
    );

    socket.close();
  });

  it('rebroadcasts refreshed state:full after resolveGate actions', async () => {
    const { createWebServer } = await import('../../src/web/server.js');

    let currentRun = {
      runId: 42,
      repoId: 'repo-1',
      featureId: 'feat-1',
      tool: 'codex',
      pipelineId: 99,
      stage: 'implement',
      rawStatus: 'blocked',
      status: 'blocked',
      startedAt: '2026-07-11T10:00:00.000Z',
      endedAt: null,
      totalTokens: 100,
      inputTokens: 50,
      outputTokens: 50,
      gateId: 7,
      gateDecision: null,
      pipelineStatus: 'blocked',
      pipelineCurrentStage: 'implement',
      pipelineResumeSummary: null,
      pendingStageRequestId: null,
      pendingStageRequestKind: null,
      pendingStageRequestPrompt: null,
      pendingStageRequestCreatedAt: null,
    };
    mocks.listRunsForTui.mockImplementation(() => [currentRun]);

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    currentRun = { ...currentRun, status: 'running', gateId: null, pipelineStatus: 'running' };
    const resolvedGateStatePromise = waitForMatchingMessage(
      socket,
      (message) => message.type === 'state:full'
        && ((message.payload as { runs: Array<{ gateId: number | null }> }).runs[0]?.gateId === null),
    );
    socket.send(JSON.stringify({ type: 'action:resolveGate', gateId: 7, decision: 'approved' }));
    await vi.waitFor(() => expect(mocks.resolveGate).toHaveBeenCalledWith(7, 'approved'));
    const resolvedGateState = await resolvedGateStatePromise;
    expect((resolvedGateState.payload as { runs: Array<{ status: string }> }).runs[0]?.status).toBe('running');

    socket.close();
  });

  it('rebroadcasts refreshed state:full after resolveStageRequest actions', async () => {
    const { createWebServer } = await import('../../src/web/server.js');

    let currentRun = {
      runId: 42,
      repoId: 'repo-1',
      featureId: 'feat-1',
      tool: 'codex',
      pipelineId: 99,
      stage: 'implement',
      rawStatus: 'blocked',
      status: 'blocked',
      startedAt: '2026-07-11T10:00:00.000Z',
      endedAt: null,
      totalTokens: 100,
      inputTokens: 50,
      outputTokens: 50,
      gateId: null,
      gateDecision: null,
      pipelineStatus: 'blocked',
      pipelineCurrentStage: 'implement',
      pipelineResumeSummary: null,
      pendingStageRequestId: 11,
      pendingStageRequestKind: 'approval',
      pendingStageRequestPrompt: 'Need approval',
      pendingStageRequestCreatedAt: '2026-07-11T10:05:00.000Z',
    };
    mocks.listRunsForTui.mockImplementation(() => [currentRun]);

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket); // state:full

    currentRun = {
      ...currentRun,
      status: 'running',
      pipelineStatus: 'running',
      pendingStageRequestId: null,
      pendingStageRequestKind: null,
      pendingStageRequestPrompt: null,
      pendingStageRequestCreatedAt: null,
    };
    const resolvedStageRequestStatePromise = waitForMatchingMessage(
      socket,
      (message) => message.type === 'state:full'
        && ((message.payload as { runs: Array<{ pendingStageRequestId: number | null }> }).runs[0]?.pendingStageRequestId === null)
        && ((message.payload as { runs: Array<{ status: string }> }).runs[0]?.status === 'running'),
    );
    socket.send(JSON.stringify({ type: 'action:resolveStageRequest', requestId: 11, response: 'advance' }));
    await vi.waitFor(() => expect(mocks.resolveStageRequest).toHaveBeenCalledWith(11, 'advance'));
    await resolvedStageRequestStatePromise;

    socket.close();
  });

  it('reconciles detached startFeature mutations on the poll loop without duplicate pending visibility', async () => {
    const { createWebServer } = await import('../../src/web/server.js');

    const featureEntry = {
      id: 'feat-1',
      title: 'Feature One',
      tool: 'codex',
      effort: 'medium',
      skills: [],
      dependsOn: [],
      workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
    };
    let runs: Array<Record<string, unknown>> = [];
    mocks.getFeatureCatalog.mockReturnValue({ 'feat-1': featureEntry });
    mocks.getPendingFeatures.mockImplementation((catalog: Record<string, typeof featureEntry>, doneFeatureIds: Set<string>, activeFeatureIds: Set<string>) =>
      Object.values(catalog).filter((feature) => !doneFeatureIds.has(feature.id) && !activeFeatureIds.has(feature.id)));
    mocks.loadBacklogFromCatalog.mockReturnValue({
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: [], stageSkills: {} },
      epics: [{ id: 'epic-1', title: 'Epic', features: [{ ...featureEntry, tasks: [] }] }],
    });
    mocks.listRunsForTui.mockImplementation(() => runs);

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const socket = new WebSocket(wsUrl);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    const initialState = await waitForSocketMessage(socket);
    expect((initialState as { payload: { pendingFeatures: Array<{ id: string }> } }).payload.pendingFeatures).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'feat-1' })]),
    );

    socket.send(JSON.stringify({ type: 'action:startFeature', featureId: 'feat-1' }));
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());

    runs = [{
      runId: 42,
      repoId: 'repo-1',
      featureId: 'feat-1',
      tool: 'codex',
      pipelineId: 99,
      stage: 'implement',
      rawStatus: 'running',
      status: 'running',
      startedAt: '2026-07-11T10:00:00.000Z',
      endedAt: null,
      totalTokens: 100,
      inputTokens: 50,
      outputTokens: 50,
      gateId: null,
      gateDecision: null,
      pipelineStatus: 'running',
      pipelineCurrentStage: 'implement',
      pipelineResumeSummary: null,
      pendingStageRequestId: null,
      pendingStageRequestKind: null,
      pendingStageRequestPrompt: null,
      pendingStageRequestCreatedAt: null,
    }];

    const reconciledState = await waitForMatchingMessage(
      socket,
      (message) => message.type === 'state:full'
        && ((message.payload as { runs: unknown[] }).runs.length === 1)
        && ((message.payload as { pendingFeatures: unknown[] }).pendingFeatures.length === 0),
      3000,
    );
    expect((reconciledState.payload as { runs: Array<{ featureId: string }> }).runs[0]?.featureId).toBe('feat-1');

    socket.close();
  });

  it('does not spawn startFeature when dependencies are still pending', async () => {
    const { createWebServer } = await import('../../src/web/server.js');

    const featureEntry = {
      id: 'feat-1',
      title: 'Feature One',
      tool: 'codex',
      effort: 'medium',
      skills: [],
      dependsOn: ['feat-0'],
      workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
    };
    mocks.getFeatureCatalog.mockReturnValue({ 'feat-1': featureEntry });
    mocks.getPendingFeatures.mockImplementation((catalog: Record<string, typeof featureEntry>, doneFeatureIds: Set<string>, activeFeatureIds: Set<string>) =>
      Object.values(catalog)
        .filter((feature) => !doneFeatureIds.has(feature.id) && !activeFeatureIds.has(feature.id))
        .map((feature) => ({ ...feature, pendingDependencies: feature.dependsOn.filter((dependency) => !doneFeatureIds.has(dependency)) })));
    mocks.loadBacklogFromCatalog.mockReturnValue({
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: [], stageSkills: {} },
      epics: [{ id: 'epic-1', title: 'Epic', features: [featureEntry] }],
    });
    mocks.listCompletedFeatureIds.mockReturnValue(new Set());

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    socket.send(JSON.stringify({ type: 'action:startFeature', featureId: 'feat-1' }));
    await vi.waitFor(() => expect(mocks.spawn).not.toHaveBeenCalled());

    socket.close();
  });

  it('spawns resume with override args when the override tool is available', async () => {
    const { createWebServer } = await import('../../src/web/server.js');

    mocks.getPipeline.mockReturnValue({ id: 99, cwd, repoId: 'repo-1', featureId: 'feat-1' });
    mocks.getAdapter.mockReturnValue({ isAvailable: () => true });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    socket.send(JSON.stringify({
      type: 'action:resumeWithOverride',
      pipelineId: 99,
      featureId: 'feat-1',
      tool: 'codex',
      model: 'gpt-5',
      effort: 'high',
    }));

    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    expect(mocks.getAdapter).toHaveBeenCalledWith('codex');
    const spawnArgs = mocks.spawn.mock.calls[0]?.[1] as string[];
    expect(spawnArgs).toEqual(expect.arrayContaining(['resume', '99', '--tool', 'codex', '--model', 'gpt-5', '--effort', 'high']));
    expect(mocks.loadBacklogFromCatalog).not.toHaveBeenCalled();
    expect(mocks.updateCatalogFeature).not.toHaveBeenCalled();

    socket.close();
  });

  it('blocks resumeWithOverride and emits ui:notice without spawning when the override tool is unavailable', async () => {
    const { createWebServer } = await import('../../src/web/server.js');

    mocks.getPipeline.mockReturnValue({ id: 99, cwd, repoId: 'repo-1', featureId: 'feat-1' });
    mocks.getAdapter.mockReturnValue({ isAvailable: () => false });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    const noticePromise = waitForMatchingMessage(
      socket,
      (message) => message.type === 'state:full'
        && ((message.payload as { notifications: Array<{ type: string }> }).notifications.length > 0),
    );
    socket.send(JSON.stringify({
      type: 'action:resumeWithOverride',
      pipelineId: 99,
      featureId: 'feat-1',
      tool: 'opencode',
    }));

    const noticeState = await noticePromise;
    expect((noticeState.payload as { notifications: Array<{ type: string; message: string }> }).notifications[0]?.type).toBe('notice');
    expect(mocks.spawn).not.toHaveBeenCalled();

    socket.close();
  });

  it('resumes without override flags when tool/model/effort are omitted', async () => {
    const { createWebServer } = await import('../../src/web/server.js');

    mocks.getPipeline.mockReturnValue({ id: 99, cwd, repoId: 'repo-1', featureId: 'feat-1' });

    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    socket.send(JSON.stringify({
      type: 'action:resumeWithOverride',
      pipelineId: 99,
      featureId: 'feat-1',
    }));

    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    expect(mocks.getAdapter).not.toHaveBeenCalled();
    const spawnArgs = mocks.spawn.mock.calls[0]?.[1] as string[];
    expect(spawnArgs).toEqual(expect.arrayContaining(['resume', '99']));
    expect(spawnArgs).not.toContain('--tool');

    socket.close();
  });

  it('serves a login form on GET /auth and never puts the password in the URL', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(`${base}/auth`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<form method="post" action="/auth">');
    expect(body).toContain('name="password"');
  });

  it('grants a session via POST /auth with the correct password and rejects bad credentials', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const good = await fetch(`${base}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: 'secret' }),
      redirect: 'manual',
    });
    expect(good.status).toBe(302);
    expect(good.headers.get('location')).toBe('/');
    const setCookie = good.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('msq_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');

    const bad = await fetch(`${base}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: 'wrong' }),
      redirect: 'manual',
    });
    expect(bad.status).toBe(401);
    expect(bad.headers.get('set-cookie')).toBeNull();

    const empty = await fetch(`${base}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(),
      redirect: 'manual',
    });
    expect(empty.status).toBe(401);
  });

  it('redirects GET /auth straight through when already carrying a valid session', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const login = await fetch(`${base}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: 'secret' }),
      redirect: 'manual',
    });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const res = await fetch(`${base}/auth`, { headers: { Cookie: cookie }, redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });

  it('redirects unauthenticated GET / to the login screen', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(`${base}/`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/auth');
  });

  it('serves the SPA at / for a request carrying a valid session cookie', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const login = await fetch(`${base}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: 'secret' }),
      redirect: 'manual',
    });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const res = await fetch(`${base}/`, { headers: { Cookie: cookie }, redirect: 'manual' });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('METAL SQUAD');
  });

  it('invalidates the session and redirects to the login screen on POST /logout', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const login = await fetch(`${base}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: 'secret' }),
      redirect: 'manual',
    });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const logout = await fetch(`${base}/logout`, { method: 'POST', headers: { Cookie: cookie }, redirect: 'manual' });
    expect(logout.status).toBe(302);
    expect(logout.headers.get('location')).toBe('/auth');
    const clearedCookie = logout.headers.get('set-cookie') ?? '';
    expect(clearedCookie).toContain('Max-Age=0');

    const afterLogout = await fetch(`${base}/`, { headers: { Cookie: cookie }, redirect: 'manual' });
    expect(afterLogout.status).toBe(302);
    expect(afterLogout.headers.get('location')).toBe('/auth');
  });

  it('rejects GET /logout', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(`${base}/logout`, { redirect: 'manual' });
    expect(res.status).toBe(405);
  });

  it('authenticates the WebSocket by session cookie without an auth message', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const login = await fetch(`${base}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: 'secret' }),
      redirect: 'manual',
    });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect(cookie).toContain('msq_session=');

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, { headers: { Cookie: cookie } });
    const message = await waitForMessageType(socket, 'state:full');
    expect((message as { type: string }).type).toBe('state:full');
    socket.close();
  });

  it('does not authenticate the WebSocket with a forged session cookie', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, {
      headers: { Cookie: 'msq_session=forged' },
    });
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'subscribe:output', runId: 1 }));
    await waitForClose(socket);
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });

  it('closes WebSocket upgrades from a foreign Origin', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, { origin: 'http://evil.example' });
    const closeCode = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('close timeout')), 2000);
      socket.once('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      socket.once('error', () => undefined);
    });
    expect(closeCode).toBe(1008);
  });

  it('allows WebSocket upgrades from the local browser origin', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, {
      origin: `http://127.0.0.1:${address.port}`,
    });
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    const message = await waitForSocketMessage(socket);
    expect((message as { type: string }).type).toBe('state:full');
    socket.close();
  });

  it('saves App config and write-only secrets through authenticated WebSocket actions', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: 'auth', token: 'secret' }));
    await waitForSocketMessage(socket);

    socket.send(JSON.stringify({ type: 'action:updateAppConfig', patch: { concurrency: 5 } }));
    await waitForMatchingMessage(socket, (message) => message.type === 'ui:info' && JSON.stringify(message).includes('Saved App config.'));
    expect(mocks.saveAppConfigPatch).toHaveBeenCalledWith({ concurrency: 5 });

    socket.send(JSON.stringify({
      type: 'action:setSecret',
      patch: { account: 'telegram-bot-token', value: 'never-return-this-value' },
    }));
    const saved = await waitForMatchingMessage(socket, (message) => message.type === 'ui:info' && JSON.stringify(message).includes('Saved secret'));
    expect(mocks.setSecret).toHaveBeenCalledWith('telegram-bot-token', 'never-return-this-value');
    expect(JSON.stringify(saved)).not.toContain('never-return-this-value');

    socket.send(JSON.stringify({ type: 'action:clearSecret', account: 'telegram-bot-token' }));
    await waitForMatchingMessage(socket, (message) => message.type === 'ui:info' && JSON.stringify(message).includes('Cleared secret'));
    expect(mocks.clearSecret).toHaveBeenCalledWith('telegram-bot-token');
    socket.close();
  });

  it('rejects sensitive WebSocket actions without authentication', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await waitForOpen(socket);
    socket.send(JSON.stringify({
      type: 'action:setSecret',
      patch: { account: 'telegram-bot-token', value: 'never-return-this-value' },
    }));
    await waitForClose(socket);
    expect(mocks.setSecret).not.toHaveBeenCalled();
  });

  it('rejects HTTP requests with a foreign Host header', async () => {
    const { createWebServer } = await import('../../src/web/server.js');
    server = createWebServer({ host: '127.0.0.1', port: 0, auth: 'token', token: 'secret' });
    await new Promise<void>((resolve) => server!.server.listen(0, '127.0.0.1', resolve));
    const address = server!.server.address() as { port: number };
    const http = await import('node:http');

    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: address.port, path: '/api/health', headers: { Host: 'evil.example' } },
        (res) => { resolve(res.statusCode ?? 0); res.resume(); },
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });
});
