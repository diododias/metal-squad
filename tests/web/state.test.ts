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
  getFeatureCatalog: vi.fn(),
  getBacklogSettings: vi.fn(),
  resolveRuntimeConfig: vi.fn(),
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
    mocks.resolveRuntimeConfig.mockReturnValue({
      theme: undefined,
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

  it('strips notification credentials from runtimeConfig before broadcast', async () => {
    const { buildMsqWebState } = await import('../../src/web/state.js');
    mocks.listRunsForTui.mockReturnValue([]);
    mocks.resolveRuntimeConfig.mockReturnValue({
      theme: undefined,
      concurrency: 3,
      staleRunThresholdMinutes: 120,
      toolTimeoutMs: 600_000,
      promptContextCharLimit: 20_000,
      stageSkills: {},
      telegramChatId: '123456',
      notifications: {
        channels: [
          { type: 'slack', webhookUrl: 'https://hooks.slack.com/services/T00/B00/secret' },
          { type: 'telegram', chatId: '123456' },
          { type: 'desktop' },
        ],
        events: ['run:start', 'run:done'],
      },
      workflow: { autoAdvanceStages: false, pollIntervalMs: 2_000 },
      budget: { alertAtPercent: 80 },
      web: { host: '127.0.0.1', port: 8743, auth: 'token' },
    });

    const state = buildMsqWebState();

    expect(state.runtimeConfig.notifications.channels).toEqual([
      { type: 'slack' },
      { type: 'telegram' },
      { type: 'desktop' },
    ]);
    expect(state.runtimeConfig.notifications.events).toEqual(['run:start', 'run:done']);
    expect(JSON.stringify(state.runtimeConfig)).not.toContain('secret');
    expect(JSON.stringify(state.runtimeConfig)).not.toContain('123456');
    expect(state.runtimeConfig).not.toHaveProperty('telegramChatId');
  });

  it('caches runtime config between builds until the caches are reset', async () => {
    const { buildMsqWebState, resetWebStateCaches } = await import('../../src/web/state.js');
    mocks.listRunsForTui.mockReturnValue([]);

    expect(buildMsqWebState().runtimeConfig.concurrency).toBe(3);

    const changed = { ...mocks.resolveRuntimeConfig(), concurrency: 9 };
    mocks.resolveRuntimeConfig.mockReturnValue(changed);
    expect(buildMsqWebState().runtimeConfig.concurrency).toBe(3);

    resetWebStateCaches();
    expect(buildMsqWebState().runtimeConfig.concurrency).toBe(9);
  });
});
