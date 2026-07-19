import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveRepo: vi.fn(),
  listCompletedFeatureIds: vi.fn(),
  listRunsForTui: vi.fn(),
  openGates: vi.fn(),
  listPendingStageRequests: vi.fn(),
  listRunningTaskRuns: vi.fn(),
  listRunsForStats: vi.fn(),
  listPendingTimeoutApprovalRequests: vi.fn(),
  getProjectStateRevision: vi.fn(),
  listProjectStateSummaries: vi.fn(),
  listRepositoryStateSummaries: vi.fn(),
  getFeatureCatalog: vi.fn(),
  getBacklogSettings: vi.fn(),
  resolveRuntimeConfig: vi.fn(),
  collectEnvironmentInfo: vi.fn(),
}));

vi.mock('../../src/core/repo.js', () => ({
  resolveRepo: mocks.resolveRepo,
}));

vi.mock('../../src/db/repo.js', () => ({
  listCompletedFeatureIds: mocks.listCompletedFeatureIds,
  listRunsForTui: mocks.listRunsForTui,
  openGates: mocks.openGates,
  listPendingStageRequests: mocks.listPendingStageRequests,
  listRunningTaskRuns: mocks.listRunningTaskRuns,
  listRunsForStats: mocks.listRunsForStats,
  listPendingTimeoutApprovalRequests: mocks.listPendingTimeoutApprovalRequests,
  getProjectStateRevision: mocks.getProjectStateRevision,
  listProjectStateSummaries: mocks.listProjectStateSummaries,
  listRepositoryStateSummaries: mocks.listRepositoryStateSummaries,
}));

vi.mock('../../src/ui/catalog.js', () => ({
  getFeatureCatalog: mocks.getFeatureCatalog,
  getBacklogSettings: mocks.getBacklogSettings,
  getPendingFeatures: (catalog: Record<string, { id: string }>, doneFeatureIds: Set<string>, activeFeatureIds: Set<string>) =>
    Object.values(catalog)
      .filter((feature: { id: string; dependsOn?: string[] }) => !doneFeatureIds.has(feature.id) && !activeFeatureIds.has(feature.id))
      .map((feature: { dependsOn?: string[] }) => ({
        ...feature,
        pendingDependencies: (feature.dependsOn ?? []).filter((dependency) => !doneFeatureIds.has(dependency)),
      })),
}));

vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: mocks.resolveRuntimeConfig,
}));

vi.mock('../../src/web/environment.js', () => ({
  collectEnvironmentInfo: mocks.collectEnvironmentInfo,
}));

describe('buildMsqWebState pendingFeatures projection', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (await import('../../src/web/state.js')).resetWebStateCaches();
    mocks.resolveRepo.mockReturnValue({ repoId: 'repo-1', path: '/tmp/metal-squad' });
    mocks.listCompletedFeatureIds.mockReturnValue(new Set());
    mocks.openGates.mockReturnValue([]);
    mocks.listPendingStageRequests.mockReturnValue([]);
    mocks.listRunningTaskRuns.mockReturnValue([]);
    mocks.listRunsForStats.mockReturnValue([]);
    mocks.listPendingTimeoutApprovalRequests.mockReturnValue([]);
    mocks.getProjectStateRevision.mockReturnValue(7);
    mocks.listProjectStateSummaries.mockReturnValue([]);
    mocks.listRepositoryStateSummaries.mockReturnValue([]);
    mocks.getFeatureCatalog.mockReturnValue({
      'feat-1': {
        id: 'feat-1',
        title: 'Feature One',
        tool: 'codex',
        effort: 'medium',
        skills: [],
        dependsOn: [],
        workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
      },
    });
    mocks.getBacklogSettings.mockReturnValue({ stageSkills: {} });
    mocks.collectEnvironmentInfo.mockReturnValue({
      databasePath: '/tmp/metal-squad/app.db',
      databaseSource: 'default',
      dbWritable: true,
      dataDir: '/tmp/metal-squad',
      configDir: '/tmp/metal-squad-config',
      configWritable: true,
      repoPath: '/tmp/metal-squad',
      repoId: 'repo-1',
      version: '0.0.1',
    });
    mocks.resolveRuntimeConfig.mockReturnValue({
      concurrency: 3,
      staleRunThresholdMinutes: 120,
      toolTimeoutMs: 600_000,
      promptContextCharLimit: 20_000,
      stageSkills: {},
      notifications: { channels: [], events: [] },
      workflow: { autoAdvanceStages: false, pollIntervalMs: 2_000 },
      budget: { alertAtPercent: 80 },
      web: { host: '127.0.0.1', port: 8743, auth: 'token' },
    });
  });

  it('removes newly started running features from pendingFeatures', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listRunsForTui.mockReturnValue([
      {
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
      },
    ]);

    expect(buildMsqWebState().pendingFeatures).toEqual([]);
  });

  it('keeps pending features visible but marks unmet dependencies', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listRunsForTui.mockReturnValue([]);
    mocks.getFeatureCatalog.mockReturnValue({
      'feat-1': {
        id: 'feat-1',
        title: 'Feature One',
        tool: 'codex',
        effort: 'medium',
        skills: [],
        dependsOn: ['feat-0'],
        workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
      },
    });

    expect(buildMsqWebState().pendingFeatures).toEqual([
      expect.objectContaining({ id: 'feat-1', pendingDependencies: ['feat-0'] }),
    ]);
  });

  it('keeps guardrail transition audit fields on run rows exposed to the web state', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listRunsForTui.mockReturnValue([
      {
        runId: 42,
        repoId: 'repo-1',
        featureId: 'feat-1',
        tool: 'codex',
        pipelineId: 99,
        stage: 'plan',
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
        pipelineCurrentStage: 'plan',
        pipelineResumeSummary: null,
        pendingStageRequestId: null,
        pendingStageRequestKind: null,
        pendingStageRequestPrompt: null,
        pendingStageRequestCreatedAt: null,
        latestTransitionDecision: 'new_session',
        latestTransitionReason: 'sixty_percent_guardrail',
        latestTransitionToStage: 'plan',
        latestTransitionContextWindowPercent: 62,
        latestTransitionPreviousSessionId: 'thread_1',
        latestTransitionNextSessionId: null,
      },
    ]);

    expect(buildMsqWebState().runs[0]).toMatchObject({
      latestTransitionReason: 'sixty_percent_guardrail',
      latestTransitionDecision: 'new_session',
    });
  });

  it('exposes pending timeout approvals in the web state', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listPendingTimeoutApprovalRequests.mockReturnValue([
      {
        id: 7,
        timeoutOccurrenceId: 3,
        runId: 42,
        pipelineId: 99,
        featureId: 'feat-1',
        stage: 'implement',
        status: 'pending',
        notificationStatus: 'sent',
        notificationAttempts: 2,
        createdAt: '2026-07-14T12:00:00.000Z',
      },
    ]);

    expect(buildMsqWebState().timeoutApprovals).toEqual([
      {
        requestId: 7,
        occurrenceId: 3,
        runId: 42,
        pipelineId: 99,
        featureId: 'feat-1',
        stage: 'implement',
        status: 'pending',
        notificationStatus: 'sent',
        notificationAttempts: 2,
        createdAt: '2026-07-14T12:00:00.000Z',
      },
    ]);
  });

  it('carries requestKind and options through pending stage requests so the web UI can answer real questions', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listPendingStageRequests.mockReturnValue([
      {
        id: 5,
        pipelineId: 99,
        runId: 42,
        featureId: 'feat-1',
        stage: 'specify',
        kind: 'input',
        prompt: 'Qual estrategia de cache?',
        options: ['Cache em memoria', 'Cache em SQLite'],
        status: 'pending',
        response: null,
        source: 'manual',
        createdAt: '2026-07-14T12:00:00.000Z',
        resolvedAt: null,
      },
    ]);

    expect(buildMsqWebState().gates).toEqual([
      {
        kind: 'stage',
        id: 5,
        featureId: 'feat-1',
        repoId: '',
        prompt: 'Qual estrategia de cache?',
        createdAt: '2026-07-14T12:00:00.000Z',
        requestKind: 'input',
        options: ['Cache em memoria', 'Cache em SQLite'],
      },
    ]);
  });

  it('removes blocked execution-owned features from pendingFeatures', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listRunsForTui.mockReturnValue([
      {
        runId: 42,
        repoId: 'repo-1',
        featureId: 'feat-1',
        tool: 'codex',
        pipelineId: 99,
        stage: 'implement',
        rawStatus: 'running',
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
      },
    ]);

    expect(buildMsqWebState().pendingFeatures).toEqual([]);
  });

  it('keeps failed features eligible for pendingFeatures', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listRunsForTui.mockReturnValue([
      {
        runId: 42,
        repoId: 'repo-1',
        featureId: 'feat-1',
        tool: 'codex',
        pipelineId: 99,
        stage: 'implement',
        rawStatus: 'failed',
        status: 'failed',
        startedAt: '2026-07-11T10:00:00.000Z',
        endedAt: '2026-07-11T10:05:00.000Z',
        totalTokens: 100,
        inputTokens: 50,
        outputTokens: 50,
        gateId: null,
        gateDecision: null,
        pipelineStatus: 'failed',
        pipelineCurrentStage: 'implement',
        pipelineResumeSummary: null,
        pendingStageRequestId: null,
        pendingStageRequestKind: null,
        pendingStageRequestPrompt: null,
        pendingStageRequestCreatedAt: null,
      },
    ]);

    expect(buildMsqWebState().pendingFeatures).toEqual([
      expect.objectContaining({ id: 'feat-1' }),
    ]);
  });

  it('exposes autoStart flag in featureCatalog projection', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listRunsForTui.mockReturnValue([]);
    mocks.getFeatureCatalog.mockReturnValue({
      'feat-1': {
        id: 'feat-1',
        title: 'Auto-start Feature',
        tool: 'claude',
        effort: 'medium',
        skills: [],
        dependsOn: [],
        workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
        autoStart: true,
      },
      'feat-2': {
        id: 'feat-2',
        title: 'Manual Feature',
        tool: 'claude',
        effort: 'medium',
        skills: [],
        dependsOn: [],
        workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
        autoStart: false,
      },
    });

    const state = buildMsqWebState();

    expect(state.featureCatalog['feat-1'].autoStart).toBe(true);
    expect(state.featureCatalog['feat-2'].autoStart).toBe(false);
  });

  it('exposes autoStart in pendingFeatures', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listRunsForTui.mockReturnValue([]);
    mocks.getFeatureCatalog.mockReturnValue({
      'feat-1': {
        id: 'feat-1',
        title: 'Auto Feature',
        tool: 'claude',
        effort: 'medium',
        skills: [],
        dependsOn: [],
        workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
        autoStart: true,
      },
    });

    const state = buildMsqWebState();
    expect(state.pendingFeatures[0]?.autoStart).toBe(true);
  });

  it('exposes the backend-collected environment diagnostics in the full state', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');

    expect(buildMsqWebState().environment).toEqual({
      databasePath: '/tmp/metal-squad/app.db',
      databaseSource: 'default',
      dbWritable: true,
      dataDir: '/tmp/metal-squad',
      configDir: '/tmp/metal-squad-config',
      configWritable: true,
      repoPath: '/tmp/metal-squad',
      repoId: 'repo-1',
      version: '0.0.1',
    });
  });

  it('projects global Projects and Repositories without leaking repository paths', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listProjectStateSummaries.mockReturnValue([{
      projectId: 'project-1', name: 'Platform', position: 4, description: 'Global state', revision: 3,
      archivedAt: null, epicCount: 2, workItemCount: 4, archivedCount: 1,
      activeRuns: 2, totalTokens: 987,
    }]);
    mocks.listRepositoryStateSummaries.mockReturnValue([{
      repoId: 'repo-1', projectId: 'project-1', path: '/private/secret/platform',
    }]);

    const state = buildMsqWebState();

    expect(state.revision).toBe(7);
    expect(state.projects).toEqual([{
      projectId: 'project-1', name: 'Platform', position: 4, description: 'Global state', revision: 3,
      archivedAt: null, counts: { epics: 2, workItems: 4, archived: 1 }, activeRuns: 2,
      tokens: { status: 'ready', totalTokens: 987, error: null },
    }]);
    expect(state.repositories).toEqual([{
      repoId: 'repo-1', projectId: 'project-1', label: 'platform',
      health: 'unchecked', lastCheckedAt: null,
    }]);
    expect(JSON.stringify(state)).not.toContain('/private/secret/platform');
    expect(state).not.toHaveProperty('activeProjectId');
  });

  it('broadcasts the same global catalog to separate clients without a server-side selection', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listProjectStateSummaries.mockReturnValue([{
      projectId: 'project-1', name: 'Shared', position: 0, description: null, revision: 1,
      archivedAt: null, epicCount: 0, workItemCount: 0, archivedCount: 0,
      activeRuns: 0, totalTokens: 0,
    }]);

    const firstClientPayload = buildMsqWebState();
    const secondClientPayload = buildMsqWebState();

    expect(secondClientPayload.projects).toEqual(firstClientPayload.projects);
    expect(secondClientPayload.repositories).toEqual(firstClientPayload.repositories);
    expect(firstClientPayload).not.toHaveProperty('activeProjectId');
  });

  it('strips notification credentials from runtimeConfig before broadcast', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listRunsForTui.mockReturnValue([]);
    mocks.resolveRuntimeConfig.mockReturnValue({
      theme: undefined,
      concurrency: 3,
      staleRunThresholdMinutes: 120,
      toolTimeoutMs: 600_000,
      promptContextCharLimit: 20_000,
      notifications: {
        channels: [
          { type: 'slack', webhookUrl: 'https://hooks.slack.com/services/T00/B00/secret' },
          { type: 'telegram', chatId: '123456' },
          { type: 'desktop' },
          { type: 'webhook', url: '' },
        ],
        events: ['run:start', 'run:done'],
      },
      budget: { alertAtPercent: 80 },
      web: { host: '127.0.0.1', port: 8743, auth: 'token' },
    });

    const state = buildMsqWebState();

    expect(state.runtimeConfig.notifications.channels).toEqual([
      { type: 'slack', configured: true },
      { type: 'telegram', configured: true },
      { type: 'desktop', configured: true },
      { type: 'webhook', configured: false },
    ]);
    expect(state.runtimeConfig.notifications.events).toEqual(['run:start', 'run:done']);
    expect(state.runtimeConfig.writability).toEqual({ dbWritable: true, configWritable: true });
    expect(JSON.stringify(state.runtimeConfig)).not.toContain('secret');
    expect(JSON.stringify(state.runtimeConfig)).not.toContain('123456');
    expect(state.runtimeConfig).not.toHaveProperty('telegramChatId');
  });

  it('invalidates cached runtime config after a settings write', async () => {
    const { buildMsqWebState, invalidateRuntimeConfigCache } = await import('../../src/web/state.js');
    mocks.listRunsForTui.mockReturnValue([]);

    expect(buildMsqWebState().runtimeConfig.concurrency).toBe(3);

    const changed = { ...mocks.resolveRuntimeConfig(), concurrency: 9 };
    mocks.resolveRuntimeConfig.mockReturnValue(changed);
    expect(buildMsqWebState().runtimeConfig.concurrency).toBe(3);

    invalidateRuntimeConfigCache();
    expect(buildMsqWebState().runtimeConfig.concurrency).toBe(9);
  });
});
