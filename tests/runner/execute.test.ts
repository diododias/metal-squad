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
const mockFinishRun = vi.fn();
const mockFinishPipeline = vi.fn();
const mockGetPipeline = vi.fn();
const mockGetPipelineSnapshot = vi.fn();
const mockGetStageRequest = vi.fn();
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
  finishRun: mockFinishRun,
  finishPipeline: mockFinishPipeline,
  getPipeline: mockGetPipeline,
  getPipelineSnapshot: mockGetPipelineSnapshot,
  getStageRequest: mockGetStageRequest,
  pausePipeline: mockPausePipeline,
  recordUsage: mockRecordUsage,
  resumePipeline: mockResumePipeline,
  setPipelineStatus: mockSetPipelineStatus,
  updatePipelineStage: vi.fn(),
  updatePipelineSnapshot: mockUpdatePipelineSnapshot,
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
  }),
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
  mockFinishRun.mockReset();
  mockFinishPipeline.mockReset();
  mockGetPipeline.mockReset();
  mockGetPipelineSnapshot.mockReset();
  mockGetStageRequest.mockReset();
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
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] },
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
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] },
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
    expect(mockCreateRetryRecord).toHaveBeenNthCalledWith(1, 7, 1, 'falha 1');
    expect(mockCreateRetryRecord).toHaveBeenNthCalledWith(2, 7, 2, 'falha 2');
    expect(mockCreateRetryRecord).toHaveBeenCalledTimes(2);
    expect(mockFinishRun).toHaveBeenCalledWith(7, 'failed', 'falha 3');

    vi.useRealTimers();
  });

  it('continues the pipeline when onFail is continue', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] },
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

  it('creates a gate and blocks the run when onFail is gate', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] },
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

    mockRunFeature.mockResolvedValue({ ok: false, summary: 'aguardando decisão humana' });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).resolves.toBeUndefined();

    expect(mockCreateGate).toHaveBeenCalledWith(7, 'feat-11', 'repo-1');
    expect(mockFinishRun).toHaveBeenCalledWith(7, 'blocked', 'aguardando decisão humana');
    expect(mockEventEmit).toHaveBeenCalledWith('run:failed', {
      runId: 7,
      featureId: 'feat-11',
      tool: 'codex',
      error: 'aguardando decisão humana',
    });
  });

  it('runs staged workflows in separate adapter sessions and asks for approval between stages', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] },
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
      'Avancar para a etapa plan?',
      { runId: 7 },
    );
    expect(mockFinishPipeline).toHaveBeenCalledWith(9, 'done');
  });

  it('restarts the same stage in a new session when the adapter requests admin input', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] },
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
