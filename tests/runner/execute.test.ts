import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Backlog } from '../../src/core/backlog/schema.js';

const mockResolveRepo = vi.fn();
const mockRegisterRepo = vi.fn();
const mockCleanupStaleRuns = vi.fn();
const mockCreateRun = vi.fn();
const mockCreatePipeline = vi.fn();
const mockCreateStageRequest = vi.fn();
const mockCreateGate = vi.fn();
const mockCreateRetryRecord = vi.fn();
const mockUpdateRunTool = vi.fn();
const mockFinishRun = vi.fn();
const mockFinishPipeline = vi.fn();
const mockGetPipeline = vi.fn();
const mockGetPipelineSnapshot = vi.fn();
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
let pipelineRow: any;

vi.mock('../../src/core/repo.js', () => ({
  resolveRepo: mockResolveRepo,
}));

vi.mock('../../src/db/repo.js', () => ({
  registerRepo: mockRegisterRepo,
  cleanupStaleRuns: mockCleanupStaleRuns,
  createRun: mockCreateRun,
  createPipeline: mockCreatePipeline,
  createStageRequest: mockCreateStageRequest,
  createGate: mockCreateGate,
  createRetryRecord: mockCreateRetryRecord,
  updateRunTool: mockUpdateRunTool,
  finishRun: mockFinishRun,
  finishPipeline: mockFinishPipeline,
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
}));

vi.mock('../../src/core/adapters/index.js', () => ({
  getAdapter: () => ({ runFeature: mockRunFeature }),
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
  loadConfig: () => ({
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
  mockCreateGate.mockReset();
  mockCreateRetryRecord.mockReset();
  mockUpdateRunTool.mockReset();
  mockFinishRun.mockReset();
  mockFinishPipeline.mockReset();
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
  mockEventEmit.mockReset();
  mockAttachDefaultEventLogger.mockReset();
  mockAttachEventNotifications.mockReset();
  mockAttachRunPersistence.mockReset();
  mockCreateSkillRegistry.mockReset();
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
    };
    return 9;
  });
  mockCreateStageRequest.mockReturnValue(11);
  mockGetPipeline.mockImplementation(() => pipelineRow);
  mockGetPipelineSnapshot.mockImplementation((row) => ({
    plan: JSON.parse(row.planJson),
    done: JSON.parse(row.doneJson),
    pending: JSON.parse(row.pendingJson),
    active: JSON.parse(row.activeJson),
    aborted: JSON.parse(row.abortedJson),
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
});

describe('executeBacklog failure persistence', () => {
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
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true },
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
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true },
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
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true },
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
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true },
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
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true },
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
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true },
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
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true },
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
    expect(mockEventEmit).toHaveBeenCalledWith('run:failed', {
      runId: 7,
      featureId: 'feat-11',
      tool: 'codex',
      error: 'aguardando decisão humana',
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
      expect.objectContaining({ cwd: '/repo' }),
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
      { runId: 7 },
    );
    expect(mockFinishPipeline).toHaveBeenCalledWith(9, 'done');
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
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true },
            },
            {
              id: 'feat-b',
              title: 'Feature B',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true },
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
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true },
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
              workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true },
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
