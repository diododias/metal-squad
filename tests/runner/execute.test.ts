import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Backlog } from '../../src/core/backlog/schema.js';

const mockResolveRepo = vi.fn();
const mockRegisterRepo = vi.fn();
const mockCleanupStaleRuns = vi.fn();
const mockCreateRun = vi.fn();
const mockCreatePipeline = vi.fn();
const mockCreateStageRequest = vi.fn();
const mockCreateStageTransitionDecision = vi.fn();
const mockCreateGate = vi.fn();
const mockCreateRetryRecord = vi.fn();
const mockUpdateRunTool = vi.fn();
const mockUpdateRunPublishState = vi.fn();
const mockUpdateStageTransitionDecisionNextSessionId = vi.fn();
const mockFinishRun = vi.fn();
const mockFinishPipeline = vi.fn();
const mockGetPipeline = vi.fn();
const mockGetPipelineSnapshot = vi.fn();
const mockGetRunContextTelemetry = vi.fn();
const mockGetStageRequest = vi.fn();
const mockListStageRequestsForFeature = vi.fn();
const mockPausePipeline = vi.fn();
const mockRecordUsage = vi.fn();
const mockResumePipeline = vi.fn();
const mockSetPipelineStatus = vi.fn();
const mockUpdatePipelineSnapshot = vi.fn();
const mockNotify = vi.fn();
const mockRunFeature = vi.fn();
const mockEventEmit = vi.fn();
const mockAttachDefaultEventLogger = vi.fn();
const mockAttachEventNotifications = vi.fn();
const mockAttachRunPersistence = vi.fn();
const mockCreateSkillRegistry = vi.fn();
const mockGetCatalogFeature = vi.fn();
const mockListCompletedFeatureIds = vi.fn();
const mockListRunsForTui = vi.fn();
const mockSpawn = vi.fn();
const mockVerifyPublishContract = vi.fn();
let pipelineRow: any;

vi.mock('../../src/core/repo.js', () => ({
  resolveRepo: mockResolveRepo,
}));

vi.mock('../../src/db/backlogCatalog.js', () => ({
  getCatalogFeature: mockGetCatalogFeature,
}));

vi.mock('../../src/db/repo.js', () => ({
  registerRepo: mockRegisterRepo,
  cleanupStaleRuns: mockCleanupStaleRuns,
  createRun: mockCreateRun,
  createPipeline: mockCreatePipeline,
  createStageRequest: mockCreateStageRequest,
  createStageTransitionDecision: mockCreateStageTransitionDecision,
  createGate: mockCreateGate,
  createRetryRecord: mockCreateRetryRecord,
  updateRunTool: mockUpdateRunTool,
  updateRunPublishState: mockUpdateRunPublishState,
  updateStageTransitionDecisionNextSessionId: mockUpdateStageTransitionDecisionNextSessionId,
  finishRun: mockFinishRun,
  finishPipeline: mockFinishPipeline,
  getRunContextTelemetry: mockGetRunContextTelemetry,
  getPipeline: mockGetPipeline,
  getPipelineSnapshot: mockGetPipelineSnapshot,
  getStageRequest: mockGetStageRequest,
  listStageRequestsForFeature: mockListStageRequestsForFeature,
  pausePipeline: mockPausePipeline,
  recordUsage: mockRecordUsage,
  resumePipeline: mockResumePipeline,
  setPipelineStatus: mockSetPipelineStatus,
  updatePipelineStage: vi.fn(),
  updatePipelineSnapshot: mockUpdatePipelineSnapshot,
  loadBudgetState: vi.fn(() => null),
  saveBudgetState: vi.fn(),
  listCompletedFeatureIds: mockListCompletedFeatureIds,
  listRunsForTui: mockListRunsForTui,
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: mockSpawn };
});

vi.mock('../../src/core/adapters/index.js', () => ({
  getAdapter: () => ({ runFeature: mockRunFeature }),
}));

vi.mock('../../src/core/git/publish.js', () => ({
  verifyPublishContract: mockVerifyPublishContract,
}));

vi.mock('../../src/core/notify/telegram.js', () => ({
  notify: mockNotify,
}));

vi.mock('../../src/core/events/index.js', () => ({
  msqEventBus: {
    emit: mockEventEmit,
  },
  attachDefaultEventLogger: mockAttachDefaultEventLogger,
  attachEventNotifications: mockAttachEventNotifications,
  attachRunPersistence: mockAttachRunPersistence,
}));

vi.mock('../../src/core/skills/index.js', () => ({
  createSkillRegistry: mockCreateSkillRegistry,
}));

vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: () => ({
    staleRunThresholdMinutes: 120,
    promptContextCharLimit: 20_000,
    workflow: { autoAdvanceStages: false, pollIntervalMs: 1 },
    budget: {},
  }),
  saveConfig: vi.fn(),
}));

beforeEach(() => {
  mockResolveRepo.mockReset();
  mockRegisterRepo.mockReset();
  mockCleanupStaleRuns.mockReset();
  mockCreateRun.mockReset();
  mockCreatePipeline.mockReset();
  mockCreateStageRequest.mockReset();
  mockCreateStageTransitionDecision.mockReset();
  mockCreateGate.mockReset();
  mockCreateRetryRecord.mockReset();
  mockUpdateRunTool.mockReset();
  mockUpdateRunPublishState.mockReset();
  mockUpdateStageTransitionDecisionNextSessionId.mockReset();
  mockFinishRun.mockReset();
  mockFinishPipeline.mockReset();
  mockGetRunContextTelemetry.mockReset();
  mockGetPipeline.mockReset();
  mockGetPipelineSnapshot.mockReset();
  mockGetStageRequest.mockReset();
  mockListStageRequestsForFeature.mockReset();
  mockPausePipeline.mockReset();
  mockRecordUsage.mockReset();
  mockResumePipeline.mockReset();
  mockSetPipelineStatus.mockReset();
  mockUpdatePipelineSnapshot.mockReset();
  mockNotify.mockReset();
  mockRunFeature.mockReset();
  mockVerifyPublishContract.mockReset();
  mockEventEmit.mockReset();
  mockAttachDefaultEventLogger.mockReset();
  mockAttachEventNotifications.mockReset();
  mockAttachRunPersistence.mockReset();
  mockCreateSkillRegistry.mockReset();
  mockGetCatalogFeature.mockReset();
  mockGetCatalogFeature.mockReturnValue(undefined);
  mockListCompletedFeatureIds.mockReset();
  // Mirrors a real DB-backed lookup: reflects whatever this pipeline's
  // snapshot has recorded as done so far, since `mockUpdatePipelineSnapshot`
  // mutates `pipelineRow` in place as the scheduler progresses.
  mockListCompletedFeatureIds.mockImplementation(() => new Set(JSON.parse(pipelineRow.doneJson)));
  mockListRunsForTui.mockReset();
  mockListRunsForTui.mockReturnValue([]);
  mockSpawn.mockReset();
  mockSpawn.mockReturnValue({ once: vi.fn(), unref: vi.fn() });
  mockResolveRepo.mockReturnValue({ repoId: 'repo-1', path: '/repo' });
  mockCreateRun.mockReturnValue(7);
  pipelineRow = {
    id: 9,
    repoId: 'repo-1',
    featureId: 'feat-1',
    status: 'running',
    cwd: '/repo',
    currentStage: null,
    autoAdvance: 0,
    planJson: '[]',
    doneJson: '[]',
    pendingJson: '[]',
    activeJson: '[]',
    abortedJson: '[]',
    workflowSnapshotJson: '{}',
    requestedAbortFeatureId: null,
    resumeCount: 0,
    resumeSummary: null,
    createdAt: '2026-07-06T00:00:00Z',
    updatedAt: '2026-07-06T00:00:00Z',
    endedAt: null,
  };
  mockCreatePipeline.mockImplementation((_repoId, featureId, autoAdvance, opts) => {
    pipelineRow = {
      ...pipelineRow,
      featureId,
      autoAdvance: autoAdvance ? 1 : 0,
      cwd: opts?.cwd ?? '/repo',
      planJson: JSON.stringify(opts?.snapshot?.plan ?? []),
      doneJson: JSON.stringify(opts?.snapshot?.done ?? []),
      pendingJson: JSON.stringify(opts?.snapshot?.pending ?? []),
      activeJson: JSON.stringify(opts?.snapshot?.active ?? []),
      abortedJson: JSON.stringify(opts?.snapshot?.aborted ?? []),
      workflowSnapshotJson: JSON.stringify(opts?.snapshot?.workflowRevisions ?? {}),
    };
    return 9;
  });
  mockCreateStageRequest.mockReturnValue(11);
  mockCreateStageTransitionDecision.mockReturnValue(101);
  mockGetRunContextTelemetry.mockReturnValue({
    runId: 7,
    stage: 'specify',
    contextWindowPercent: 25,
    reliable: true,
  });
  mockGetPipeline.mockImplementation(() => pipelineRow);
  mockGetPipelineSnapshot.mockImplementation((row) => ({
    plan: JSON.parse(row.planJson),
    done: JSON.parse(row.doneJson),
    pending: JSON.parse(row.pendingJson),
    active: JSON.parse(row.activeJson),
    aborted: JSON.parse(row.abortedJson),
    workflowRevisions: JSON.parse(row.workflowSnapshotJson ?? '{}'),
  }));
  mockUpdatePipelineSnapshot.mockImplementation((_pipelineId, patch, opts = {}) => {
    const current = mockGetPipelineSnapshot(pipelineRow);
    const next = { ...current, ...patch };
    pipelineRow = {
      ...pipelineRow,
      planJson: JSON.stringify(next.plan),
      doneJson: JSON.stringify(next.done),
      pendingJson: JSON.stringify(next.pending),
      activeJson: JSON.stringify(next.active),
      abortedJson: JSON.stringify(next.aborted),
      workflowSnapshotJson: JSON.stringify(next.workflowRevisions ?? {}),
      status: opts.status ?? pipelineRow.status,
      requestedAbortFeatureId: opts.clearAbortRequest ? null : pipelineRow.requestedAbortFeatureId,
    };
  });
  mockListStageRequestsForFeature.mockReturnValue([]);
  mockAttachDefaultEventLogger.mockReturnValue(vi.fn());
  mockAttachEventNotifications.mockReturnValue(vi.fn());
  mockAttachRunPersistence.mockReturnValue(vi.fn());
  mockCreateSkillRegistry.mockReturnValue({
    resolve: vi.fn((names: string[]) =>
      names.map((name) => ({
        name,
        source: 'builtin',
        promptTemplate: `Run ${name} for {{featureId}}`,
        metadata: { description: name },
      })),
    ),
  });
  mockVerifyPublishContract.mockReturnValue({
    ok: true,
    status: 'done',
    summary: 'implement publish verified on feat/test (https://example/pr/1).',
    evidence: {
      branch: 'feat/test',
      baseBranch: 'develop',
      commitSha: 'abc1234',
      remoteBranch: 'origin/feat/test',
      prNumber: 1,
      prUrl: 'https://example/pr/1',
    },
  });
});

function createAdaptiveBacklog(alwaysIsolatedStages: string[] = []): Backlog {
  return {
    version: 2,
    repo: 'repo',
    defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
    epics: [
      {
        id: 'epic-1',
        title: 'Epic',
        features: [
          {
            id: 'feat-41',
            title: 'Adaptive Feature',
            spec: 'spec',
            tasks: [],
            tool: 'codex',
            effort: 'medium',
            dependsOn: [],
            workflow: {
              mode: 'staged',
              stages: ['specify', 'plan'],
              approvals: { channel: 'telegram', autoAdvance: false },
              syncTasksToBacklog: false,
              sessionPolicy: { mode: 'adaptive', alwaysIsolatedStages },
            },
          },
        ],
      },
    ],
  };
}

function createImplementStageBacklog(): Backlog {
  return {
    version: 2,
    repo: 'repo',
    defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
    epics: [
      {
        id: 'epic-1',
        title: 'Epic',
        features: [
          {
            id: 'feat-implement',
            title: 'Implement Feature',
            spec: 'spec',
            tasks: [],
            tool: 'codex',
            effort: 'medium',
            dependsOn: [],
            workflow: {
              mode: 'staged',
              stages: ['implement'],
              approvals: { channel: 'telegram', autoAdvance: false },
              syncTasksToBacklog: false,
              sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
            },
          },
        ],
      },
    ],
  };
}

describe('executeBacklog failure persistence', () => {
  it('verifies publish evidence after a successful implement stage', async () => {
    mockRunFeature.mockResolvedValue({
      ok: true,
      summary: 'implemented and published',
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(createImplementStageBacklog(), { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockVerifyPublishContract).toHaveBeenCalledWith('/repo');
    expect(mockUpdateRunPublishState).toHaveBeenCalledWith(7, {
      verified: true,
      error: null,
      evidence: {
        branch: 'feat/test',
        baseBranch: 'develop',
        commitSha: 'abc1234',
        remoteBranch: 'origin/feat/test',
        prNumber: 1,
        prUrl: 'https://example/pr/1',
      },
    });
    expect(mockFinishRun).toHaveBeenCalledWith(
      7,
      'done',
      'implement publish verified on feat/test (https://example/pr/1).',
    );
  });

  it('blocks implement completion when publish verification is inconclusive', async () => {
    mockRunFeature.mockResolvedValue({
      ok: true,
      summary: 'implemented but publish verification pending',
    });
    mockVerifyPublishContract.mockReturnValue({
      ok: false,
      status: 'blocked',
      summary: 'implement: GitHub CLI is unavailable, so PR verification could not be completed.',
      evidence: {
        branch: 'feat/test',
        baseBranch: 'develop',
        commitSha: 'abc1234',
        remoteBranch: 'origin/feat/test',
        prNumber: null,
        prUrl: null,
      },
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(createImplementStageBacklog(), { cwd: '/repo', concurrency: 1 }),
    ).rejects.toThrow(
      'Feature feat-implement falhou: implement: implemented but publish verification pending\nimplement: GitHub CLI is unavailable, so PR verification could not be completed.',
    );

    expect(mockFinishRun).toHaveBeenCalledWith(
      7,
      'blocked',
      'implemented but publish verification pending\nimplement: GitHub CLI is unavailable, so PR verification could not be completed.',
    );
    expect(mockUpdateRunPublishState).toHaveBeenCalledWith(7, {
      verified: false,
      error: 'implemented but publish verification pending\nimplement: GitHub CLI is unavailable, so PR verification could not be completed.',
      evidence: {
        branch: 'feat/test',
        baseBranch: 'develop',
        commitSha: 'abc1234',
        remoteBranch: 'origin/feat/test',
        prNumber: null,
        prUrl: null,
      },
    });
  });

  it('stores failed status with partial summary from adapter timeout', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-02',
              title: 'Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
            },
          ],
        },
      ],
    };

    mockRunFeature.mockResolvedValue({
      ok: false,
      summary:
        'timeout após 605s. última mensagem do agente: Atualizando registry. arquivos tocados: src/core/skills/registry.ts',
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).rejects.toThrow(
      'Feature feat-02 falhou: timeout após 605s. última mensagem do agente: Atualizando registry. arquivos tocados: src/core/skills/registry.ts',
    );

    expect(mockFinishRun).toHaveBeenCalledWith(
      7,
      'failed',
      'timeout após 605s. última mensagem do agente: Atualizando registry. arquivos tocados: src/core/skills/registry.ts',
    );
    expect(mockCreateRetryRecord).not.toHaveBeenCalled();
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect(mockRunFeature).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      { cwd: '/repo', runId: 7, signal: expect.any(AbortSignal) },
    );
    expect(mockAttachDefaultEventLogger).toHaveBeenCalled();
    expect(mockAttachEventNotifications).toHaveBeenCalled();
    expect(mockAttachRunPersistence).toHaveBeenCalled();
    expect(mockEventEmit).toHaveBeenCalledWith('run:start', {
      runId: 7,
      featureId: 'feat-02',
      tool: 'codex',
    });
    expect(mockEventEmit).toHaveBeenCalledWith('run:failed', {
      runId: 7,
      featureId: 'feat-02',
      tool: 'codex',
      error: 'timeout após 605s. última mensagem do agente: Atualizando registry. arquivos tocados: src/core/skills/registry.ts',
      kind: 'execution',
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('retries up to maxAttempts before failing', async () => {
    vi.useFakeTimers();
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-11',
              title: 'Retry Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
              retry: {
                maxAttempts: 3,
                backoffMs: 10,
                onFail: 'stop',
              },
            },
          ],
        },
      ],
    };

    mockRunFeature
      .mockResolvedValueOnce({ ok: false, summary: 'falha 1' })
      .mockResolvedValueOnce({ ok: false, summary: 'falha 2' })
      .mockResolvedValueOnce({ ok: false, summary: 'falha 3' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    const runPromise = executeBacklog(backlog, { cwd: '/repo', concurrency: 1 });
    const rejection = expect(runPromise).rejects.toThrow('Feature feat-11 falhou: falha 3');
    await vi.runAllTimersAsync();

    await rejection;
    expect(mockRunFeature).toHaveBeenCalledTimes(3);
    expect(mockCreateRetryRecord).toHaveBeenNthCalledWith(1, 7, 1, 'falha 1', expect.any(Number), 'codex', undefined);
    expect(mockCreateRetryRecord).toHaveBeenNthCalledWith(2, 7, 2, 'falha 2', expect.any(Number), 'codex', undefined);
    expect(mockCreateRetryRecord).toHaveBeenCalledTimes(2);
    expect(mockFinishRun).toHaveBeenCalledWith(7, 'failed', 'falha 3');
    // The failed feature must land in the `aborted` (needs-rerun) snapshot bucket
    // instead of disappearing from pending/active/done/aborted entirely — otherwise
    // `msq resume`/the TUI have no record that this feature still needs to run.
    expect(JSON.parse(pipelineRow.abortedJson)).toEqual(['feat-11']);
    expect(JSON.parse(pipelineRow.doneJson)).toEqual([]);

    vi.useRealTimers();
  });

  it('exhausts primary then tries fallbacks in order before succeeding, updating runs.tool to the winner', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'claude', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-fallback',
              title: 'Fallback Feature',
              spec: 'spec',
              tasks: [],
              tool: 'claude',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
              retry: {
                maxAttempts: 2,
                backoffMs: 0,
                onFail: 'stop',
                fallback: [
                  { tool: 'codex', maxAttempts: 1 },
                  { tool: 'opencode', model: 'gpt-4o', maxAttempts: 1 },
                ],
              },
            },
          ],
        },
      ],
    };

    mockRunFeature
      .mockResolvedValueOnce({ ok: false, summary: 'claude falha 1' })
      .mockResolvedValueOnce({ ok: false, summary: 'claude falha 2' })
      .mockResolvedValueOnce({ ok: false, summary: 'codex falha' })
      .mockResolvedValueOnce({ ok: true, summary: 'opencode ok' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockRunFeature).toHaveBeenCalledTimes(4);
    expect(mockRunFeature.mock.calls[0]![0].tool).toBe('claude');
    expect(mockRunFeature.mock.calls[1]![0].tool).toBe('claude');
    expect(mockRunFeature.mock.calls[2]![0].tool).toBe('codex');
    expect(mockRunFeature.mock.calls[3]![0].tool).toBe('opencode');
    expect(mockRunFeature.mock.calls[3]![0].model).toBe('gpt-4o');

    expect(mockCreateRetryRecord).toHaveBeenCalledTimes(3);
    expect(mockCreateRetryRecord).toHaveBeenNthCalledWith(1, 7, 1, 'claude falha 1', expect.any(Number), 'claude', undefined);
    expect(mockCreateRetryRecord).toHaveBeenNthCalledWith(2, 7, 2, 'claude falha 2', expect.any(Number), 'claude', undefined);
    expect(mockCreateRetryRecord).toHaveBeenNthCalledWith(3, 7, 3, 'codex falha', expect.any(Number), 'codex', undefined);

    expect(mockUpdateRunTool).toHaveBeenCalledWith(7, 'opencode');
    expect(mockFinishRun).toHaveBeenCalledWith(7, 'done', 'opencode ok');
  });

  it('applies onFail only after every candidate (primary + all fallbacks) is exhausted', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'claude', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-fallback-exhausted',
              title: 'Fallback Feature',
              spec: 'spec',
              tasks: [],
              tool: 'claude',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
              retry: {
                maxAttempts: 1,
                backoffMs: 0,
                onFail: 'stop',
                fallback: [{ tool: 'codex', maxAttempts: 1 }],
              },
            },
          ],
        },
      ],
    };

    mockRunFeature
      .mockResolvedValueOnce({ ok: false, summary: 'claude falha' })
      .mockResolvedValueOnce({ ok: false, summary: 'codex falha' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).rejects.toThrow('Feature feat-fallback-exhausted falhou: codex falha');

    expect(mockRunFeature).toHaveBeenCalledTimes(2);
    expect(mockCreateGate).not.toHaveBeenCalled();
    expect(mockUpdateRunTool).toHaveBeenCalledWith(7, 'codex');
    expect(mockFinishRun).toHaveBeenCalledWith(7, 'failed', 'codex falha');
  });

  it('continues the pipeline when onFail is continue', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-11',
              title: 'Retry Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
              retry: {
                maxAttempts: 1,
                backoffMs: 0,
                onFail: 'continue',
              },
            },
            {
              id: 'feat-12',
              title: 'Dependent Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: ['feat-11'],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
            },
          ],
        },
      ],
    };

    mockCreateRun.mockReturnValueOnce(7).mockReturnValueOnce(8);
    mockRunFeature
      .mockResolvedValueOnce({ ok: false, summary: 'falha tolerada' })
      .mockResolvedValueOnce({ ok: true, summary: 'ok' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockRunFeature).toHaveBeenCalledTimes(2);
    expect(mockFinishRun).toHaveBeenNthCalledWith(1, 7, 'failed', 'falha tolerada');
    expect(mockFinishRun).toHaveBeenNthCalledWith(2, 8, 'done', 'ok');
  });

  it('creates a gate, pauses the pipeline, and resumes the same feature once the gate is approved', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-11',
              title: 'Retry Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
              retry: {
                maxAttempts: 1,
                backoffMs: 0,
                onFail: 'gate',
              },
            },
          ],
        },
      ],
    };

    mockCreateRun.mockReturnValueOnce(7).mockReturnValueOnce(8);
    mockRunFeature
      .mockResolvedValueOnce({ ok: false, summary: 'aguardando decisão humana' })
      .mockResolvedValueOnce({ ok: true, summary: 'ok apos aprovacao' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    const pipelinePromise = executeBacklog(backlog, { cwd: '/repo', concurrency: 1 });

    await vi.waitFor(() => {
      expect(mockCreateGate).toHaveBeenCalledWith(7, 'feat-11', 'repo-1');
    });
    expect(mockFinishRun).toHaveBeenCalledWith(7, 'blocked', 'aguardando decisão humana');
    expect(mockEventEmit).toHaveBeenCalledWith('run:blocked', {
      runId: 7,
      featureId: 'feat-11',
      tool: 'codex',
      reason: 'gate',
      summary: 'aguardando decisão humana',
    });
    expect(mockRunFeature).toHaveBeenCalledTimes(1);

    // Nothing resolves the pipeline while the gate is unresolved: the
    // process stays paused waiting for a human decision instead of
    // finishing as if the feature had completed.
    expect(mockFinishPipeline).not.toHaveBeenCalled();

    // Simulate an operator approving the gate (forceResolveGate ->
    // resumePipeline), which the control poller picks up.
    pipelineRow = { ...pipelineRow, status: 'running' };

    await pipelinePromise;

    expect(mockRunFeature).toHaveBeenCalledTimes(2);
    expect(mockFinishRun).toHaveBeenCalledWith(8, 'done', 'ok apos aprovacao');
    expect(mockFinishPipeline).toHaveBeenCalledWith(9, 'done');
  });

  it('runs staged workflows in separate adapter sessions and asks for approval between stages', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-27',
              title: 'Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: {
                mode: 'staged',
                stages: ['specify', 'plan'],
                approvals: { channel: 'telegram', autoAdvance: false },
                syncTasksToBacklog: false,
                sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
                stepGuidance: {
                  plan: {
                    prompt: 'Focus only on planning output.',
                  },
                },
              },
            },
          ],
        },
      ],
    };

    mockRunFeature
      .mockResolvedValueOnce({ ok: true, summary: 'spec ok' })
      .mockResolvedValueOnce({ ok: true, summary: 'plan ok' });
    mockGetStageRequest.mockReturnValue({ status: 'resolved', response: 'advance' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockCreatePipeline).toHaveBeenCalledWith(
      'repo-1',
      'feat-27',
      false,
      expect.objectContaining({
        cwd: '/repo',
        snapshot: expect.objectContaining({
          workflowRevisions: {
            'feat-27': expect.objectContaining({
              stages: ['specify', 'plan'],
              stepGuidance: { plan: { prompt: 'Focus only on planning output.' } },
            }),
          },
        }),
      }),
    );
    expect(mockCreateRun).toHaveBeenNthCalledWith(1, 'repo-1', 'feat-27', 'codex', {
      pipelineId: 9,
      stage: 'specify',
    });
    expect(mockCreateRun).toHaveBeenNthCalledWith(2, 'repo-1', 'feat-27', 'codex', {
      pipelineId: 9,
      stage: 'plan',
    });
    expect(mockCreateStageRequest).toHaveBeenCalledWith(
      9,
      'feat-27',
      'specify',
      'approval',
      'Advance to stage plan?',
      { runId: 7 },
    );
    expect(mockRunFeature).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      expect.stringContaining('Treat the following block as the exact feature description passed to `/speckit-specify`:'),
      { cwd: '/repo', runId: 7, signal: expect.any(AbortSignal) },
    );
    expect(mockRunFeature.mock.calls[0]?.[1]).toContain('Feature: Feature');
    expect(mockRunFeature.mock.calls[0]?.[1]).toContain('Summary:\nspec');
    expect(mockRunFeature.mock.calls[1]?.[1]).toContain('Focus only on planning output.');
    expect(mockFinishPipeline).toHaveBeenCalledWith(9, 'done');
  });

  it('rehydrates the pre-save workflow order while retaining live approvals after a later reorder', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [{
        id: 'epic-1',
        title: 'Epic',
        features: [{
          id: 'feat-27', title: 'Feature', spec: 'spec', tasks: [], tool: 'codex', effort: 'medium', dependsOn: [],
          workflow: {
            mode: 'staged', stages: ['plan', 'specify', 'implement'], approvals: { channel: 'telegram', autoAdvance: true },
            syncTasksToBacklog: false, sessionPolicy: { mode: 'adaptive', alwaysIsolatedStages: [] },
          },
        }],
      }],
    };
    const { rehydrateBacklogWorkflowRevisions } = await import('../../src/core/runner/execute.js');

    const restored = rehydrateBacklogWorkflowRevisions(backlog, {
      'feat-27': {
        mode: 'staged', stages: ['specify', 'plan', 'implement'], syncTasksToBacklog: true,
        sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: ['plan'] },
        stepGuidance: { plan: { prompt: 'Revision A.' } },
      },
    });

    expect(restored.epics[0]?.features[0]?.workflow).toEqual({
      mode: 'staged', stages: ['specify', 'plan', 'implement'], approvals: { channel: 'telegram', autoAdvance: true },
      syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: ['plan'] },
      stepGuidance: { plan: { prompt: 'Revision A.' } },
    });
  });

  it('honors autoAdvance toggled mid-run via the catalog instead of the value captured at run start', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-27',
              title: 'Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: {
                mode: 'staged',
                stages: ['specify', 'plan'],
                // Run started with autoAdvance disabled...
                approvals: { channel: 'telegram', autoAdvance: false },
                syncTasksToBacklog: false,
                sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
              },
            },
          ],
        },
      ],
    };

    // ...but the user flips the checkbox in the web UI while the run is in
    // flight, which patches the catalog row read by `getCatalogFeature`.
    mockGetCatalogFeature.mockReturnValue({
      workflow: { approvals: { autoAdvance: true } },
    });

    mockRunFeature
      .mockResolvedValueOnce({ ok: true, summary: 'spec ok' })
      .mockResolvedValueOnce({ ok: true, summary: 'plan ok' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockGetCatalogFeature).toHaveBeenCalledWith('repo-1', 'feat-27');
    // Auto-advance path: a resolved 'approval' request is recorded with
    // source 'auto', and execution never blocks on mockGetStageRequest.
    expect(mockCreateStageRequest).toHaveBeenCalledWith(
      9,
      'feat-27',
      'specify',
      'approval',
      'Auto-advance enabled; next stage: plan.',
      { runId: 7, response: 'advance', source: 'auto' },
    );
    expect(mockGetStageRequest).not.toHaveBeenCalled();
    expect(mockFinishPipeline).toHaveBeenCalledWith(9, 'done');
  });

  it('restarts the same stage in a new session when the adapter requests admin input', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-27',
              title: 'Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: {
                mode: 'staged',
                stages: ['specify'],
                approvals: { channel: 'telegram', autoAdvance: false },
                syncTasksToBacklog: false,
                sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
              },
            },
          ],
        },
      ],
    };

    mockRunFeature
      .mockResolvedValueOnce({
        ok: true,
        summary: 'MSQ_INPUT_REQUIRED: Qual o nome da feature?',
        control: { type: 'needs_input', prompt: 'Qual o nome da feature?' },
      })
      .mockResolvedValueOnce({ ok: true, summary: 'spec ok' });
    mockGetStageRequest.mockReturnValue({ status: 'resolved', response: 'Nome final' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockCreateRun).toHaveBeenCalledTimes(2);
    const resumedPrompt = mockRunFeature.mock.calls[1]?.[1] ?? '';
    expect(resumedPrompt).toContain('/speckit-specify');
    expect(resumedPrompt).toContain('Feature summary:\nspec');
    expect(resumedPrompt).toContain('Admin inputs already collected for this stage:\n- Nome final');
    expect(resumedPrompt.lastIndexOf('Nome final')).toBeGreaterThan(resumedPrompt.indexOf('Feature summary:\nspec'));
    expect(resumedPrompt.endsWith('- Nome final')).toBe(true);
    expect(mockFinishRun).toHaveBeenCalledWith(
      7,
      'blocked',
      'MSQ_INPUT_REQUIRED: Qual o nome da feature?',
    );
    expect(mockCreateStageRequest).toHaveBeenCalledWith(
      9,
      'feat-27',
      'specify',
      'input',
      'Qual o nome da feature?',
      { runId: 7, options: undefined },
    );
    expect(mockFinishPipeline).toHaveBeenCalledWith(9, 'done');
  });

  it('propagates control.options to createStageRequest when the adapter returns discrete options', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-27',
              title: 'Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: {
                mode: 'staged',
                stages: ['specify'],
                approvals: { channel: 'telegram', autoAdvance: false },
                syncTasksToBacklog: false,
                sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
              },
            },
          ],
        },
      ],
    };

    mockRunFeature
      .mockResolvedValueOnce({
        ok: true,
        summary: 'MSQ_INPUT_REQUIRED: Qual estrategia de cache?',
        control: {
          type: 'needs_input',
          prompt: 'Qual estrategia de cache?',
          options: ['Cache em memoria', 'Cache em SQLite'],
        },
      })
      .mockResolvedValueOnce({ ok: true, summary: 'spec ok' });
    mockGetStageRequest.mockReturnValue({ status: 'resolved', response: 'Cache em memoria' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockCreateStageRequest).toHaveBeenCalledWith(
      9,
      'feat-27',
      'specify',
      'input',
      'Qual estrategia de cache?',
      { runId: 7, options: ['Cache em memoria', 'Cache em SQLite'] },
    );
  });

  it('resumes the previous adapter session when retrying a stage after needs_input is answered', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-27',
              title: 'Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: {
                mode: 'staged',
                stages: ['specify'],
                approvals: { channel: 'telegram', autoAdvance: false },
                syncTasksToBacklog: false,
                sessionPolicy: { mode: 'adaptive', alwaysIsolatedStages: [] },
              },
            },
          ],
        },
      ],
    };

    mockRunFeature
      .mockResolvedValueOnce({
        ok: true,
        summary: 'MSQ_INPUT_REQUIRED: Qual o nome da feature?',
        control: { type: 'needs_input', prompt: 'Qual o nome da feature?' },
        session: {
          tool: 'codex',
          sessionId: 'thread_q',
          capturedFromRunId: 7,
          capturedAt: '2026-07-11T11:00:00Z',
        },
      })
      .mockResolvedValueOnce({ ok: true, summary: 'spec ok' });
    mockGetStageRequest.mockReturnValue({ status: 'resolved', response: 'Nome final' });
    mockGetRunContextTelemetry.mockReturnValue({
      runId: 7,
      stage: 'specify',
      contextWindowPercent: 20,
      reliable: true,
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockRunFeature.mock.calls[1]?.[2]).toEqual({
      cwd: '/repo',
      runId: 7,
      signal: expect.any(AbortSignal),
      session: {
        mode: 'resume',
        handle: {
          tool: 'codex',
          sessionId: 'thread_q',
          capturedFromRunId: 7,
          capturedAt: '2026-07-11T11:00:00Z',
        },
      },
    });
  });

  it('resumes a staged workflow from the next stage after an approved checkpoint', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-27',
              title: 'Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: {
                mode: 'staged',
                stages: ['specify', 'plan', 'implement'],
                approvals: { channel: 'telegram', autoAdvance: false },
                syncTasksToBacklog: false,
                sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
              },
            },
          ],
        },
      ],
    };

    pipelineRow = {
      ...pipelineRow,
      featureId: 'feat-27',
      currentStage: 'specify',
      planJson: JSON.stringify(['feat-27']),
      doneJson: JSON.stringify([]),
      pendingJson: JSON.stringify([]),
      activeJson: JSON.stringify(['feat-27']),
      abortedJson: JSON.stringify([]),
    };
    mockListStageRequestsForFeature.mockReturnValue([
      {
        id: 11,
        pipelineId: 9,
        runId: 7,
        featureId: 'feat-27',
        stage: 'specify',
        kind: 'approval',
        prompt: 'Advance to stage plan?',
        status: 'resolved',
        response: 'advance',
        source: 'manual',
        createdAt: '2026-07-07T10:30:19Z',
        resolvedAt: '2026-07-07T10:31:00Z',
      },
    ]);
    mockRunFeature
      .mockResolvedValueOnce({ ok: true, summary: 'plan ok' })
      .mockResolvedValueOnce({ ok: true, summary: 'implement ok' });
    mockGetStageRequest.mockReturnValue({ status: 'resolved', response: 'advance' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1, resumePipelineId: 9 }),
    ).resolves.toBeUndefined();

    expect(mockResumePipeline).toHaveBeenCalledWith(9);
    expect(mockCreateRun).toHaveBeenNthCalledWith(1, 'repo-1', 'feat-27', 'codex', {
      pipelineId: 9,
      stage: 'plan',
    });
    expect(mockCreateRun).toHaveBeenNthCalledWith(2, 'repo-1', 'feat-27', 'codex', {
      pipelineId: 9,
      stage: 'implement',
    });
  });

  it('reuses the previous session on low-usage adaptive transitions when the next stage is eligible', async () => {
    const backlog = createAdaptiveBacklog();

    mockRunFeature
      .mockResolvedValueOnce({
        ok: true,
        summary: 'spec ok',
        session: {
          tool: 'codex',
          sessionId: 'thread_1',
          capturedFromRunId: 7,
          capturedAt: '2026-07-11T11:00:00Z',
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        summary: 'plan ok',
        session: {
          tool: 'codex',
          sessionId: 'thread_1',
          capturedFromRunId: 8,
          capturedAt: '2026-07-11T11:05:00Z',
        },
      });
    mockGetStageRequest.mockReturnValue({ status: 'resolved', response: 'advance' });
    mockGetRunContextTelemetry.mockReturnValue({
      runId: 7,
      stage: 'specify',
      contextWindowPercent: 20,
      reliable: true,
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockCreateStageTransitionDecision).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'reuse',
      reason: 'low_usage_reuse',
      previousSessionId: 'thread_1',
    }));
    expect(mockRunFeature.mock.calls[1]?.[2]).toEqual({
      cwd: '/repo',
      runId: 7,
      signal: expect.any(AbortSignal),
      session: {
        mode: 'resume',
        handle: {
          tool: 'codex',
          sessionId: 'thread_1',
          capturedFromRunId: 7,
          capturedAt: '2026-07-11T11:00:00Z',
        },
      },
    });
    expect(mockUpdateStageTransitionDecisionNextSessionId).toHaveBeenCalledWith(101, 'thread_1');
  });

  it('reuses the previous session in the mid band below sixty percent when a handle is available', async () => {
    const backlog = createAdaptiveBacklog();

    mockRunFeature
      .mockResolvedValueOnce({
        ok: true,
        summary: 'spec ok',
        session: {
          tool: 'codex',
          sessionId: 'thread_mid',
          capturedFromRunId: 7,
          capturedAt: '2026-07-11T11:10:00Z',
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        summary: 'plan ok',
        session: {
          tool: 'codex',
          sessionId: 'thread_mid',
          capturedFromRunId: 8,
          capturedAt: '2026-07-11T11:12:00Z',
        },
      });
    mockGetStageRequest.mockReturnValue({ status: 'resolved', response: 'advance' });
    mockGetRunContextTelemetry.mockReturnValue({
      runId: 7,
      stage: 'specify',
      contextWindowPercent: 55,
      reliable: true,
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockCreateStageTransitionDecision).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'reuse',
      reason: 'mid_usage_reuse',
      previousSessionId: 'thread_mid',
    }));
    expect(mockRunFeature.mock.calls[1]?.[2]).toEqual({
      cwd: '/repo',
      runId: 7,
      signal: expect.any(AbortSignal),
      session: {
        mode: 'resume',
        handle: {
          tool: 'codex',
          sessionId: 'thread_mid',
          capturedFromRunId: 7,
          capturedAt: '2026-07-11T11:10:00Z',
        },
      },
    });
  });

  it('falls back to a new session when adaptive reuse is allowed but no reusable handle is available', async () => {
    const backlog = createAdaptiveBacklog();

    mockRunFeature
      .mockResolvedValueOnce({
        ok: true,
        summary: 'spec ok',
        session: null,
      })
      .mockResolvedValueOnce({ ok: true, summary: 'plan ok' });
    mockGetStageRequest.mockReturnValue({ status: 'resolved', response: 'advance' });
    mockGetRunContextTelemetry.mockReturnValue({
      runId: 7,
      stage: 'specify',
      contextWindowPercent: 55,
      reliable: true,
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockCreateStageTransitionDecision).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'new_session',
      reason: 'session_resume_unavailable',
      previousSessionId: null,
    }));
    expect(mockRunFeature.mock.calls[1]?.[2]).toEqual({
      cwd: '/repo',
      runId: 7,
      signal: expect.any(AbortSignal),
    });
  });

  it('forces a new session when the next adaptive stage is always isolated', async () => {
    const backlog = createAdaptiveBacklog(['plan']);

    mockRunFeature
      .mockResolvedValueOnce({
        ok: true,
        summary: 'spec ok',
        session: {
          tool: 'codex',
          sessionId: 'thread_1',
          capturedFromRunId: 7,
          capturedAt: '2026-07-11T11:00:00Z',
        },
      })
      .mockResolvedValueOnce({ ok: true, summary: 'plan ok' });
    mockGetStageRequest.mockReturnValue({ status: 'resolved', response: 'advance' });
    mockGetRunContextTelemetry.mockReturnValue({
      runId: 7,
      stage: 'specify',
      contextWindowPercent: null,
      reliable: false,
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockCreateStageTransitionDecision).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'new_session',
      reason: 'always_isolated_stage',
    }));
    expect(mockRunFeature.mock.calls[1]?.[2]).toEqual({
      cwd: '/repo',
      runId: 7,
      signal: expect.any(AbortSignal),
    });
  });

  it('forces a new session when adaptive telemetry is missing', async () => {
    const backlog = createAdaptiveBacklog();

    mockRunFeature
      .mockResolvedValueOnce({
        ok: true,
        summary: 'spec ok',
        session: {
          tool: 'codex',
          sessionId: 'thread_1',
          capturedFromRunId: 7,
          capturedAt: '2026-07-11T11:00:00Z',
        },
      })
      .mockResolvedValueOnce({ ok: true, summary: 'plan ok' });
    mockGetStageRequest.mockReturnValue({ status: 'resolved', response: 'advance' });
    mockGetRunContextTelemetry.mockReturnValue({
      runId: 7,
      stage: 'specify',
      contextWindowPercent: null,
      reliable: false,
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockCreateStageTransitionDecision).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'new_session',
      reason: 'missing_context_telemetry',
    }));
    expect(mockRunFeature.mock.calls[1]?.[2]).toEqual({
      cwd: '/repo',
      runId: 7,
      signal: expect.any(AbortSignal),
    });
  });

  it('forces a new session at the sixty percent guardrail', async () => {
    const backlog = createAdaptiveBacklog();

    mockRunFeature
      .mockResolvedValueOnce({
        ok: true,
        summary: 'spec ok',
        session: {
          tool: 'codex',
          sessionId: 'thread_60',
          capturedFromRunId: 7,
          capturedAt: '2026-07-11T11:15:00Z',
        },
      })
      .mockResolvedValueOnce({ ok: true, summary: 'plan ok' });
    mockGetStageRequest.mockReturnValue({ status: 'resolved', response: 'advance' });
    mockGetRunContextTelemetry.mockReturnValue({
      runId: 7,
      stage: 'specify',
      contextWindowPercent: 60,
      reliable: true,
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockCreateStageTransitionDecision).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'new_session',
      reason: 'sixty_percent_guardrail',
      previousSessionId: 'thread_60',
    }));
    expect(mockRunFeature.mock.calls[1]?.[2]).toEqual({
      cwd: '/repo',
      runId: 7,
      signal: expect.any(AbortSignal),
    });
  });

  it('forces a new session at or above the high-usage guardrail', async () => {
    const backlog = createAdaptiveBacklog();

    mockRunFeature
      .mockResolvedValueOnce({
        ok: true,
        summary: 'spec ok',
        session: {
          tool: 'codex',
          sessionId: 'thread_70',
          capturedFromRunId: 7,
          capturedAt: '2026-07-11T11:20:00Z',
        },
      })
      .mockResolvedValueOnce({ ok: true, summary: 'plan ok' });
    mockGetStageRequest.mockReturnValue({ status: 'resolved', response: 'advance' });
    mockGetRunContextTelemetry.mockReturnValue({
      runId: 7,
      stage: 'specify',
      contextWindowPercent: 72,
      reliable: true,
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockCreateStageTransitionDecision).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'new_session',
      reason: 'high_usage_guardrail',
      previousSessionId: 'thread_70',
    }));
    expect(mockRunFeature.mock.calls[1]?.[2]).toEqual({
      cwd: '/repo',
      runId: 7,
      signal: expect.any(AbortSignal),
    });
  });

  it('applies resumeOverride only to the initial candidate of the target featureId, leaving other pending features on persisted config', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-a',
              title: 'Feature A',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
            },
            {
              id: 'feat-b',
              title: 'Feature B',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
            },
          ],
        },
      ],
    };

    pipelineRow = {
      ...pipelineRow,
      featureId: 'feat-a',
      currentStage: null,
      planJson: JSON.stringify(['feat-a', 'feat-b']),
      doneJson: JSON.stringify([]),
      pendingJson: JSON.stringify(['feat-a', 'feat-b']),
      activeJson: JSON.stringify([]),
      abortedJson: JSON.stringify([]),
    };

    mockCreateRun.mockReturnValueOnce(7).mockReturnValueOnce(8);
    mockRunFeature
      .mockResolvedValueOnce({ ok: true, summary: 'a ok' })
      .mockResolvedValueOnce({ ok: true, summary: 'b ok' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, {
        cwd: '/repo',
        concurrency: 1,
        resumePipelineId: 9,
        resumeOverride: { featureId: 'feat-a', tool: 'opencode' },
      }),
    ).resolves.toBeUndefined();

    expect(mockRunFeature).toHaveBeenCalledTimes(2);
    expect(mockRunFeature.mock.calls[0]![0].id).toBe('feat-a');
    expect(mockRunFeature.mock.calls[0]![0].tool).toBe('opencode');
    expect(mockRunFeature.mock.calls[1]![0].id).toBe('feat-b');
    expect(mockRunFeature.mock.calls[1]![0].tool).toBe('codex');
  });

  it('returns jitter within the expected exponential interval', async () => {
    const { backoffWithJitter } = await import('../../src/core/runner/execute.js');

    const attempt1 = backoffWithJitter(1000, 1);
    const attempt3 = backoffWithJitter(1000, 3);
    const capped = backoffWithJitter(40_000, 3);

    expect(attempt1).toBeGreaterThanOrEqual(500);
    expect(attempt1).toBeLessThanOrEqual(1000);
    expect(attempt3).toBeGreaterThanOrEqual(2000);
    expect(attempt3).toBeLessThanOrEqual(4000);
    expect(capped).toBeGreaterThanOrEqual(30_000);
    expect(capped).toBeLessThanOrEqual(60_000);
  });
});

describe('executeBacklog budget caps', () => {
  it('pauses the pipeline, creates a gate, and alerts when the budget is exceeded', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      budget: { maxTokens: 100 },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-budget',
              title: 'Expensive Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
            },
          ],
        },
      ],
    };

    mockRunFeature.mockResolvedValue({
      ok: true,
      summary: 'done',
      usage: { input: 150, output: 50, total: 200 },
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');
    await executeBacklog(backlog, { cwd: '/repo', concurrency: 1 });

    expect(mockRecordUsage).toHaveBeenCalledWith(7, { input: 150, output: 50, total: 200 });
    expect(mockPausePipeline).toHaveBeenCalledWith(9);
    expect(mockCreateGate).toHaveBeenCalledWith(7, 'feat-budget', 'repo-1');
    expect(mockFinishRun).toHaveBeenCalledWith(
      7,
      'blocked',
      expect.stringContaining('budget exceeded'),
    );
    expect(mockEventEmit).toHaveBeenCalledWith('budget:alert', {
      percent: 100,
      spent: 200,
      limit: 100,
    });
  });

  it('emits a budget alert at the configured threshold without pausing', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      budget: { maxTokens: 1000 },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-alert',
              title: 'Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
            },
          ],
        },
      ],
    };

    mockRunFeature.mockResolvedValue({
      ok: true,
      summary: 'done',
      usage: { input: 500, output: 300, total: 800 },
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');
    await executeBacklog(backlog, { cwd: '/repo', concurrency: 1 });

    expect(mockEventEmit).toHaveBeenCalledWith('budget:alert', {
      percent: 80,
      spent: 800,
      limit: 1000,
    });
    expect(mockPausePipeline).not.toHaveBeenCalled();
    expect(mockCreateGate).not.toHaveBeenCalled();
    expect(mockFinishPipeline).toHaveBeenCalledWith(9, 'done');
  });
});

function twoFeatureAutoStartBacklog(overrides: {
  feat01AutoStart?: boolean;
  feat02AutoStart?: boolean;
  feat01Retry?: Backlog['epics'][number]['features'][number]['retry'];
} = {}): Backlog {
  return {
    version: 2,
    repo: 'repo',
    defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
    epics: [
      {
        id: 'epic-1',
        title: 'Epic',
        features: [
          {
            id: 'feat-01',
            title: 'First',
            spec: 'spec',
            tasks: [],
            tool: 'codex',
            effort: 'medium',
            dependsOn: [],
            autoStart: overrides.feat01AutoStart ?? true,
            retry: overrides.feat01Retry,
            workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
          },
          {
            id: 'feat-02',
            title: 'Second',
            spec: 'spec',
            tasks: [],
            tool: 'codex',
            effort: 'medium',
            dependsOn: [],
            autoStart: overrides.feat02AutoStart ?? true,
            workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
          },
        ],
      },
    ],
  } as unknown as Backlog;
}

describe('executeBacklog auto-pilot', () => {
  it('spawns the next eligible autoStart feature after a successful run', async () => {
    const backlog = twoFeatureAutoStartBacklog();
    mockRunFeature.mockResolvedValue({ ok: true, summary: 'done' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');
    await executeBacklog(backlog, { cwd: '/repo', concurrency: 1, featureId: 'feat-01' });

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['run', '--feature', 'feat-02']),
      expect.objectContaining({ detached: true, stdio: 'ignore', cwd: '/repo' }),
    );
    expect(mockEventEmit).toHaveBeenCalledWith('autopilot:decision', expect.objectContaining({
      triggerFeatureId: 'feat-01',
      triggerKind: 'success',
      action: 'start',
      selectedFeatureId: 'feat-02',
    }));
  });

  it('does not dispatch when the completed feature does not have autoStart', async () => {
    const backlog = twoFeatureAutoStartBacklog({ feat01AutoStart: false });
    mockRunFeature.mockResolvedValue({ ok: true, summary: 'done' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');
    await executeBacklog(backlog, { cwd: '/repo', concurrency: 1, featureId: 'feat-01' });

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockEventEmit).not.toHaveBeenCalledWith('autopilot:decision', expect.anything());
  });

  it('does not dispatch a manual-only (autoStart=false) candidate', async () => {
    const backlog = twoFeatureAutoStartBacklog({ feat02AutoStart: false });
    mockRunFeature.mockResolvedValue({ ok: true, summary: 'done' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');
    await executeBacklog(backlog, { cwd: '/repo', concurrency: 1, featureId: 'feat-01' });

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockEventEmit).toHaveBeenCalledWith('autopilot:decision', expect.objectContaining({
      action: 'idle',
    }));
  });

  it('continues to the next autoStart feature after an ordinary execution failure', async () => {
    const backlog = twoFeatureAutoStartBacklog({
      feat01Retry: { maxAttempts: 1, backoffMs: 0, onFail: 'continue', fallback: [] },
    });
    mockRunFeature.mockResolvedValue({ ok: false, summary: 'boom' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');
    await executeBacklog(backlog, { cwd: '/repo', concurrency: 1, featureId: 'feat-01' });

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['run', '--feature', 'feat-02']),
      expect.any(Object),
    );
    expect(mockEventEmit).toHaveBeenCalledWith('autopilot:decision', expect.objectContaining({
      triggerKind: 'failed-execution',
      action: 'start',
      selectedFeatureId: 'feat-02',
    }));
  });

  it('does not continue after a manually aborted run', async () => {
    const backlog = twoFeatureAutoStartBacklog();
    mockRunFeature.mockResolvedValue({ ok: false, aborted: true, summary: 'aborted by operator' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');
    await executeBacklog(backlog, { cwd: '/repo', concurrency: 1, featureId: 'feat-01' });

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockEventEmit).toHaveBeenCalledWith('autopilot:decision', expect.objectContaining({
      triggerKind: 'aborted-manual',
      action: 'idle',
    }));
  });

  it('stops auto-pilot and does not dispatch after a protective budget stop', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      budget: { maxTokens: 100 },
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-01',
              title: 'Expensive',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              autoStart: true,
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
            },
            {
              id: 'feat-02',
              title: 'Second',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              autoStart: true,
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
            },
          ],
        },
      ],
    } as unknown as Backlog;

    mockRunFeature.mockResolvedValue({
      ok: true,
      summary: 'done',
      usage: { input: 150, output: 50, total: 200 },
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');
    await executeBacklog(backlog, { cwd: '/repo', concurrency: 1, featureId: 'feat-01' });

    expect(mockEventEmit).toHaveBeenCalledWith('run:blocked', expect.objectContaining({
      featureId: 'feat-01',
      reason: 'budget',
    }));
    expect(mockEventEmit).toHaveBeenCalledWith('autopilot:decision', expect.objectContaining({
      triggerKind: 'blocked-protective',
      action: 'stop',
    }));
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('does not dispatch when the run was invoked without --feature (full backlog scheduling stays in-process)', async () => {
    const backlog = twoFeatureAutoStartBacklog();
    mockRunFeature.mockResolvedValue({ ok: true, summary: 'done' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');
    await executeBacklog(backlog, { cwd: '/repo', concurrency: 1 });

    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe('executeBacklog dependency-aware manual start', () => {
  it('starts only the requested feature when dependencies are already completed', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: [], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-parent',
              title: 'Parent',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
            },
            {
              id: 'feat-child',
              title: 'Child',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: ['feat-parent'],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
            },
          ],
        },
      ],
    } as unknown as Backlog;
    mockListCompletedFeatureIds.mockReturnValue(new Set(['feat-parent']));
    mockRunFeature.mockResolvedValue({ ok: true, summary: 'done' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');
    await executeBacklog(backlog, { cwd: '/repo', concurrency: 1, featureId: 'feat-child' });

    expect(mockCreatePipeline).toHaveBeenCalledWith(
      'repo-1',
      'feat-child',
      false,
      expect.objectContaining({
        snapshot: expect.objectContaining({
          plan: ['feat-child'],
          pending: ['feat-child'],
        }),
      }),
    );
  });

  it('rejects manual start when dependencies are still pending', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: [], stageSkills: {} },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-parent',
              title: 'Parent',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
            },
            {
              id: 'feat-child',
              title: 'Child',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: ['feat-parent'],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
            },
          ],
        },
      ],
    } as unknown as Backlog;
    mockListCompletedFeatureIds.mockReturnValue(new Set());

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(executeBacklog(backlog, { cwd: '/repo', concurrency: 1, featureId: 'feat-child' })).rejects.toThrow(
      'Feature feat-child has pending dependencies: feat-parent.',
    );
    expect(mockCreatePipeline).not.toHaveBeenCalled();
  });
});
