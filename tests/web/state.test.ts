import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveRepo: vi.fn(),
  listRunsForTui: vi.fn(),
  openGates: vi.fn(),
  listPendingStageRequests: vi.fn(),
  listRunningTaskRuns: vi.fn(),
  listRunsForStats: vi.fn(),
  getFeatureCatalog: vi.fn(),
  getBacklogSettings: vi.fn(),
  resolveRuntimeConfig: vi.fn(),
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
}));

vi.mock('../../src/ui/catalog.js', () => ({
  getFeatureCatalog: mocks.getFeatureCatalog,
  getBacklogSettings: mocks.getBacklogSettings,
  getPendingFeatures: (catalog: Record<string, { id: string }>, doneFeatureIds: Set<string>, activeFeatureIds: Set<string>) =>
    Object.values(catalog).filter((feature) => !doneFeatureIds.has(feature.id) && !activeFeatureIds.has(feature.id)),
}));

vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: mocks.resolveRuntimeConfig,
}));

describe('buildMsqWebState pendingFeatures projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRepo.mockReturnValue({ repoId: 'repo-1', path: '/tmp/metal-squad' });
    mocks.openGates.mockReturnValue([]);
    mocks.listPendingStageRequests.mockReturnValue([]);
    mocks.listRunningTaskRuns.mockReturnValue([]);
    mocks.listRunsForStats.mockReturnValue([]);
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
});
