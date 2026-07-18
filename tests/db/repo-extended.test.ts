import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAll = vi.fn();
const mockRun = vi.fn();
const mockGet = vi.fn();
const mockPrepare = vi.fn(() => ({ all: mockAll, run: mockRun, get: mockGet }));
const mockPragma = vi.fn();
const mockExec = vi.fn();
const mockClose = vi.fn();
const mockTransaction = vi.fn((callback: () => unknown) => callback);
const mockDb = { prepare: mockPrepare, pragma: mockPragma, exec: mockExec, close: mockClose, transaction: mockTransaction };
const mockDatabase = vi.fn(() => mockDb);
const mockEmit = vi.fn();

vi.mock('better-sqlite3', () => ({ default: mockDatabase }));
vi.mock('../../src/config/index.js', () => ({
  DB_PATH: ':memory:',
  ensureDataDir: vi.fn(),
  resolveDbPath: vi.fn(() => ':memory:'),
}));
vi.mock('../../src/core/events/index.js', () => ({
  msqEventBus: { emit: mockEmit },
  logCaughtError: vi.fn(),
}));

beforeEach(async () => {
  vi.resetModules();
  mockAll.mockReset();
  mockRun.mockReset();
  mockGet.mockReset();
  mockAll.mockReturnValue([]);
  mockPrepare.mockImplementation(() => ({ all: mockAll, run: mockRun, get: mockGet }));
  mockEmit.mockReset();
  mockClose.mockReset();
  mockTransaction.mockClear();
  mockPrepare.mockReset();
  mockPrepare.mockImplementation(() => ({ all: mockAll, run: mockRun, get: mockGet }));
  mockRun.mockReturnValue({ lastInsertRowid: 1, changes: 1 });
});

describe('registerRepo', () => {
  it('calls prepare+run with repoId and path', async () => {
    const { registerRepo } = await import('../../src/db/repo.js');
    registerRepo('repo-1', '/path/to/repo');
    expect(mockRun).toHaveBeenCalledWith('repo-1', '/path/to/repo');
  });
});

describe('createRun', () => {
  it('returns new run id from lastInsertRowid', async () => {
    mockRun.mockReturnValueOnce({ lastInsertRowid: 7, changes: 1 });
    const { createRun } = await import('../../src/db/repo.js');
    const id = createRun('repo-1', 'feat-1', 'claude');
    expect(id).toBe(7);
  });

  it('inserts run with pipelineId and stage from opts', async () => {
    const { createRun } = await import('../../src/db/repo.js');
    createRun('repo-1', 'feat-1', 'codex', { pipelineId: 3, stage: 'implement' });
    const firstCall = mockRun.mock.calls[0];
    expect(firstCall).toContain('repo-1');
    expect(firstCall).toContain('feat-1');
    expect(firstCall).toContain('codex');
    expect(firstCall).toContain(3);
    expect(firstCall).toContain('implement');
  });

  it('uses null for pipelineId/stage when not provided', async () => {
    const { createRun } = await import('../../src/db/repo.js');
    createRun('repo-1', 'feat-1', 'claude');
    const firstCall = mockRun.mock.calls[0];
    expect(firstCall).toContain(null); // pipelineId null
  });
});

describe('finishRun', () => {
  it('calls prepare+run with status and runId', async () => {
    const { finishRun } = await import('../../src/db/repo.js');
    finishRun(5, 'done');
    expect(mockRun.mock.calls[0]).toContain('done');
    expect(mockRun.mock.calls[0]).toContain(5);
  });

  it('passes summary when provided', async () => {
    const { finishRun } = await import('../../src/db/repo.js');
    finishRun(5, 'done', 'Summary text');
    expect(mockRun.mock.calls[0]).toContain('Summary text');
  });

  it('passes null for summary when not provided', async () => {
    const { finishRun } = await import('../../src/db/repo.js');
    finishRun(5, 'failed');
    expect(mockRun.mock.calls[0]).toContain(null);
  });
});

describe('cleanupStaleRuns', () => {
  it('returns number of changes', async () => {
    mockRun.mockReturnValueOnce({ changes: 3, lastInsertRowid: 0 });
    const { cleanupStaleRuns } = await import('../../src/db/repo.js');
    const changed = cleanupStaleRuns(60);
    expect(changed).toBe(3);
  });

  it('passes olderThanMinutes to query', async () => {
    const { cleanupStaleRuns } = await import('../../src/db/repo.js');
    cleanupStaleRuns(30);
    expect(mockRun).toHaveBeenCalledWith(30);
  });
});

describe('recordUsage', () => {
  it('calls updateRunUsage and inserts token_usage row', async () => {
    const { recordUsage } = await import('../../src/db/repo.js');
    recordUsage(1, { input: 100, output: 50, total: 150, cachedInput: 10 });
    // First run() call is from updateRunUsage
    expect(mockRun.mock.calls[0]).toContain(100);
    // Second run() call inserts into token_usage
    expect(mockRun.mock.calls[1]).toContain(1); // run_id
    expect(mockRun.mock.calls[1]).toContain(10); // cached_input
    expect(mockRun.mock.calls[1]).toContain(150); // total
  });

  it('defaults cachedInput to 0 when not provided', async () => {
    const { recordUsage } = await import('../../src/db/repo.js');
    recordUsage(2, { input: 100, output: 50, total: 150 });
    // Second call is token_usage insert — cachedInput defaults to 0
    expect(mockRun.mock.calls[1]).toContain(0);
  });
});

describe('updateRunUsage', () => {
  it('calls run with token fields and runId', async () => {
    const { updateRunUsage } = await import('../../src/db/repo.js');
    updateRunUsage(9, { input: 10, output: 4, total: 14, cachedInput: 2 });
    expect(mockRun).toHaveBeenCalledWith(10, 2, 4, 14, 9);
  });

  it('defaults cachedInput to null when undefined', async () => {
    const { updateRunUsage } = await import('../../src/db/repo.js');
    updateRunUsage(9, { input: 10, output: 4, total: 14 });
    expect(mockRun).toHaveBeenCalledWith(10, null, 4, 14, 9);
  });
});

describe('listRuns', () => {
  it('returns empty array when no rows', async () => {
    mockAll.mockReturnValue([]);
    const { listRuns } = await import('../../src/db/repo.js');
    expect(listRuns()).toEqual([]);
  });

  it('passes limit to .all()', async () => {
    mockAll.mockReturnValue([]);
    const { listRuns } = await import('../../src/db/repo.js');
    listRuns(25);
    expect(mockAll).toHaveBeenCalledWith(25);
  });

  it('returns rows from db', async () => {
    const row = { id: 1, repo_id: 'r', feature_id: 'f', tool: 'claude', status: 'done' };
    mockAll.mockReturnValue([row]);
    const { listRuns } = await import('../../src/db/repo.js');
    const result = listRuns();
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(row);
  });
});

describe('stage transition decisions', () => {
  it('creates a transition-decision audit row', async () => {
    const { createStageTransitionDecision } = await import('../../src/db/repo.js');
    createStageTransitionDecision({
      pipelineId: 9,
      featureId: 'feat-41',
      fromRunId: 7,
      fromStage: 'specify',
      toStage: 'plan',
      policyMode: 'adaptive',
      decision: 'reuse',
      reason: 'low_usage_reuse',
      contextWindowPercent: 25,
      previousSessionId: 'thread_1',
      nextSessionId: null,
    });
    expect(mockRun).toHaveBeenCalledWith(
      9,
      'feat-41',
      7,
      'specify',
      'plan',
      'adaptive',
      'reuse',
      'low_usage_reuse',
      25,
      'thread_1',
      null,
    );
  });

  it('reads a run telemetry snapshot with derived reliability', async () => {
    mockGet.mockReturnValue({
      runId: 7,
      stage: 'specify',
      contextWindowPercent: 48.5,
    });
    const { getRunContextTelemetry } = await import('../../src/db/repo.js');
    expect(getRunContextTelemetry(7)).toEqual({
      runId: 7,
      stage: 'specify',
      contextWindowPercent: 48.5,
      reliable: true,
    });
  });

  it('lists persisted transition decisions', async () => {
    mockAll.mockReturnValue([
      {
        id: 1,
        pipelineId: 9,
        featureId: 'feat-41',
        fromRunId: 7,
        fromStage: 'specify',
        toStage: 'plan',
        policyMode: 'adaptive',
        decision: 'reuse',
        reason: 'low_usage_reuse',
        contextWindowPercent: 25,
        previousSessionId: 'thread_1',
        nextSessionId: 'thread_1',
        createdAt: '2026-07-11T12:00:00Z',
      },
    ]);
    const { listStageTransitionDecisions } = await import('../../src/db/repo.js');
    expect(listStageTransitionDecisions(9, 'feat-41')).toEqual([
      expect.objectContaining({
        id: 1,
        reason: 'low_usage_reuse',
        nextSessionId: 'thread_1',
      }),
    ]);
  });
});

describe('timeout approval persistence', () => {
  it('creates and reads timeout occurrences and approval requests', async () => {
    mockGet
      .mockReturnValueOnce({ status: 'running' })
      .mockReturnValueOnce({
        id: 12,
        runId: 7,
        pipelineId: 4,
        featureId: 'feat-timeout',
        stage: 'implement',
        timeoutMs: 600_000,
        runtimeMs: 605_000,
        lastProgress: 'still writing tests',
        status: 'pending',
        createdAt: '2026-07-14T12:00:00.000Z',
        resolvedAt: null,
      })
      .mockReturnValueOnce({
        id: 12,
        runId: 7,
        pipelineId: 4,
        featureId: 'feat-timeout',
        stage: 'implement',
        timeoutMs: 600_000,
        runtimeMs: 605_000,
        lastProgress: 'still writing tests',
        status: 'pending',
        createdAt: '2026-07-14T12:00:00.000Z',
        resolvedAt: null,
      })
      .mockReturnValueOnce({
        id: 30,
        timeoutOccurrenceId: 12,
        pipelineId: 4,
        runId: 7,
        featureId: 'feat-timeout',
        stage: 'implement',
        status: 'pending',
        decision: null,
        decisionSource: null,
        notificationStatus: 'pending',
        notificationAttempts: 0,
        lastNotificationError: null,
        notifiedAt: null,
        retryRunId: null,
        createdAt: '2026-07-14T12:00:00.000Z',
        resolvedAt: null,
      });

    const { createTimeoutOccurrence, createTimeoutApprovalRequest } = await import('../../src/db/repo.js');
    const occurrence = createTimeoutOccurrence({
      runId: 7,
      pipelineId: 4,
      featureId: 'feat-timeout',
      stage: 'implement',
      timeoutMs: 600_000,
      runtimeMs: 605_000,
      lastProgress: 'still writing tests',
    });
    const request = createTimeoutApprovalRequest(12);

    expect(occurrence).toMatchObject({
      id: 12,
      featureId: 'feat-timeout',
      stage: 'implement',
      status: 'pending',
    });
    expect(request).toMatchObject({
      id: 30,
      timeoutOccurrenceId: 12,
      featureId: 'feat-timeout',
      notificationStatus: 'pending',
    });
  });

  it('returns null when creating a timeout occurrence for a finished run', async () => {
    mockGet.mockReturnValueOnce({ status: 'done' });

    const { createTimeoutOccurrence } = await import('../../src/db/repo.js');
    const occurrence = createTimeoutOccurrence({
      runId: 8,
      featureId: 'feat-timeout',
      timeoutMs: 600_000,
      runtimeMs: 605_000,
    });

    expect(occurrence).toBeNull();
  });

  it('lists pending timeout approvals and looks up approved ones by stage', async () => {
    mockAll.mockReturnValue([
      {
        id: 30,
        timeoutOccurrenceId: 12,
        pipelineId: 4,
        runId: 7,
        featureId: 'feat-timeout',
        stage: 'implement',
        status: 'pending',
        decision: null,
        decisionSource: null,
        notificationStatus: 'sent',
        notificationAttempts: 1,
        lastNotificationError: null,
        notifiedAt: '2026-07-14T12:00:05.000Z',
        retryRunId: null,
        createdAt: '2026-07-14T12:00:00.000Z',
        resolvedAt: null,
      },
    ]);
    mockGet.mockReturnValueOnce({
      id: 31,
      timeoutOccurrenceId: 13,
      pipelineId: 4,
      runId: 8,
      featureId: 'feat-timeout',
      stage: 'implement',
      status: 'approved',
      decision: 'retry',
      decisionSource: 'telegram',
      notificationStatus: 'sent',
      notificationAttempts: 1,
      lastNotificationError: null,
      notifiedAt: '2026-07-14T12:00:05.000Z',
      retryRunId: null,
      createdAt: '2026-07-14T12:00:00.000Z',
      resolvedAt: '2026-07-14T12:01:00.000Z',
    });

    const { listPendingTimeoutApprovalRequests, getApprovedTimeoutApproval } = await import('../../src/db/repo.js');
    expect(listPendingTimeoutApprovalRequests()).toEqual([
      expect.objectContaining({
        id: 30,
        featureId: 'feat-timeout',
        status: 'pending',
      }),
    ]);
    expect(getApprovedTimeoutApproval(4, 'feat-timeout', 'implement')).toMatchObject({
      id: 31,
      decision: 'retry',
      decisionSource: 'telegram',
    });
  });

  it('resolves timeout approvals, emits the resolution event, and tracks retry bookkeeping', async () => {
    mockGet
      .mockReturnValueOnce({
        id: 30,
        timeoutOccurrenceId: 12,
        pipelineId: 4,
        runId: 7,
        featureId: 'feat-timeout',
        stage: 'implement',
        status: 'pending',
        decision: null,
        decisionSource: null,
        notificationStatus: 'pending',
        notificationAttempts: 0,
        lastNotificationError: null,
        notifiedAt: null,
        retryRunId: null,
        createdAt: '2026-07-14T12:00:00.000Z',
        resolvedAt: null,
      })
      .mockReturnValueOnce({ state: 'active', threadId: 321 })
      .mockReturnValueOnce({
        id: 30,
        timeoutOccurrenceId: 12,
        pipelineId: 4,
        runId: 7,
        featureId: 'feat-timeout',
        stage: 'implement',
        status: 'approved',
        decision: 'retry',
        decisionSource: 'telegram',
        notificationStatus: 'sent',
        notificationAttempts: 1,
        lastNotificationError: null,
        notifiedAt: '2026-07-14T12:00:05.000Z',
        retryRunId: null,
        createdAt: '2026-07-14T12:00:00.000Z',
        resolvedAt: '2026-07-14T12:01:00.000Z',
      })
      .mockReturnValueOnce({
        id: 12,
        runId: 7,
        pipelineId: 4,
        featureId: 'feat-timeout',
        stage: 'implement',
        timeoutMs: 600_000,
        runtimeMs: 605_000,
        lastProgress: 'still writing tests',
        status: 'resolved',
        createdAt: '2026-07-14T12:00:00.000Z',
        resolvedAt: '2026-07-14T12:01:00.000Z',
      });

    const {
      resolveTimeoutApproval,
      claimTimeoutRetry,
      attachTimeoutRetryRun,
      recordTimeoutNotificationDelivery,
    } = await import('../../src/db/repo.js');

    expect(resolveTimeoutApproval(30, 'retry', {
      featureId: 'feat-timeout',
      runId: 7,
      stage: 'implement',
      chatId: 'chat-1',
      threadId: 321,
    })).toBe(true);
    expect(mockEmit).toHaveBeenCalledWith('timeout:approval-resolved', expect.objectContaining({
      requestId: 30,
      featureId: 'feat-timeout',
      decision: 'retry',
    }));

    expect(claimTimeoutRetry(30)).toBe(true);
    attachTimeoutRetryRun(30, 99);
    recordTimeoutNotificationDelivery(30, { status: 'failed', error: 'telegram down' });

    expect(mockRun).toHaveBeenCalledWith('approved', 'retry', 30);
    expect(mockRun).toHaveBeenCalledWith(99, 30);
    expect(mockRun).toHaveBeenCalledWith(99, 30);
    expect(mockRun).toHaveBeenCalledWith('failed', 'telegram down', 'failed', 30);
  });
});

describe('recordRunEvent', () => {
  it('inserts event without metadata', async () => {
    const { recordRunEvent } = await import('../../src/db/repo.js');
    recordRunEvent(1, 'started');
    expect(mockRun).toHaveBeenCalledWith(1, 'started', null);
  });

  it('inserts event with JSON-encoded metadata', async () => {
    const { recordRunEvent } = await import('../../src/db/repo.js');
    recordRunEvent(1, 'retry', { attempt: 2 });
    expect(mockRun).toHaveBeenCalledWith(1, 'retry', JSON.stringify({ attempt: 2 }));
  });
});

describe('listRunEvents', () => {
  it('returns empty array when no rows', async () => {
    mockAll.mockReturnValue([]);
    const { listRunEvents } = await import('../../src/db/repo.js');
    expect(listRunEvents(1)).toEqual([]);
  });

  it('parses JSON metadata from rows', async () => {
    mockAll.mockReturnValue([
      { id: 1, runId: 1, event: 'started', metadata: '{"stage":"impl"}', createdAt: '2024-01-01' },
    ]);
    const { listRunEvents } = await import('../../src/db/repo.js');
    const result = listRunEvents(1);
    expect(result[0]!.metadata).toEqual({ stage: 'impl' });
  });

  it('handles null metadata', async () => {
    mockAll.mockReturnValue([
      { id: 1, runId: 1, event: 'started', metadata: null, createdAt: '2024-01-01' },
    ]);
    const { listRunEvents } = await import('../../src/db/repo.js');
    const result = listRunEvents(1);
    expect(result[0]!.metadata).toBeNull();
  });

  it('handles invalid JSON metadata gracefully', async () => {
    mockAll.mockReturnValue([
      { id: 1, runId: 1, event: 'started', metadata: 'not-json', createdAt: '2024-01-01' },
    ]);
    const { listRunEvents } = await import('../../src/db/repo.js');
    const result = listRunEvents(1);
    expect(result[0]!.metadata).toBeNull();
  });
});

describe('createRetryRecord', () => {
  it('inserts retry record with error and records event', async () => {
    const { createRetryRecord } = await import('../../src/db/repo.js');
    createRetryRecord(5, 2, 'timeout error', 3000);
    // First call: INSERT into retry_history
    expect(mockRun.mock.calls[0]).toContain(5);
    expect(mockRun.mock.calls[0]).toContain(2);
    expect(mockRun.mock.calls[0]).toContain('timeout error');
  });

  it('handles missing error and waitMs', async () => {
    const { createRetryRecord } = await import('../../src/db/repo.js');
    createRetryRecord(5, 1);
    expect(mockRun.mock.calls[0]).toContain(null); // error → null
  });
});

describe('listRunsForStats', () => {
  it('returns empty array when no rows', async () => {
    mockAll.mockReturnValue([]);
    const { listRunsForStats } = await import('../../src/db/repo.js');
    expect(listRunsForStats()).toEqual([]);
  });

  it('passes sinceDays filter to query', async () => {
    mockAll.mockReturnValue([]);
    const { listRunsForStats } = await import('../../src/db/repo.js');
    listRunsForStats({ sinceDays: 7 });
    expect(mockAll).toHaveBeenCalledWith(7);
  });

  it('passes repoId filter to query', async () => {
    mockAll.mockReturnValue([]);
    const { listRunsForStats } = await import('../../src/db/repo.js');
    listRunsForStats({ repoId: 'my-repo' });
    expect(mockAll).toHaveBeenCalledWith('my-repo');
  });

  it('passes tool filter to query', async () => {
    mockAll.mockReturnValue([]);
    const { listRunsForStats } = await import('../../src/db/repo.js');
    listRunsForStats({ tool: 'claude' });
    expect(mockAll).toHaveBeenCalledWith('claude');
  });

  it('passes combined filters', async () => {
    mockAll.mockReturnValue([]);
    const { listRunsForStats } = await import('../../src/db/repo.js');
    listRunsForStats({ sinceDays: 30, repoId: 'r1', tool: 'codex' });
    expect(mockAll).toHaveBeenCalledWith(30, 'r1', 'codex');
  });

  it('passes no params when no filters', async () => {
    mockAll.mockReturnValue([]);
    const { listRunsForStats } = await import('../../src/db/repo.js');
    listRunsForStats({});
    expect(mockAll).toHaveBeenCalledWith(); // no params
  });
});

describe('upsertTaskRun', () => {
  it('calls run twice (insert then update)', async () => {
    const { upsertTaskRun } = await import('../../src/db/repo.js');
    upsertTaskRun(1, 'task-1', 'My Task', 'running');
    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it('passes taskId, title, status to insert', async () => {
    const { upsertTaskRun } = await import('../../src/db/repo.js');
    upsertTaskRun(1, 'task-2', 'Another Task', 'done', 'implement');
    expect(mockRun.mock.calls[0]).toContain('task-2');
    expect(mockRun.mock.calls[0]).toContain('Another Task');
    expect(mockRun.mock.calls[0]).toContain('done');
    expect(mockRun.mock.calls[0]).toContain('implement');
  });
});

describe('listTaskRunsForRun', () => {
  it('returns empty array when no rows', async () => {
    mockAll.mockReturnValue([]);
    const { listTaskRunsForRun } = await import('../../src/db/repo.js');
    expect(listTaskRunsForRun(1)).toEqual([]);
  });

  it('queries with runId', async () => {
    mockAll.mockReturnValue([]);
    const { listTaskRunsForRun } = await import('../../src/db/repo.js');
    listTaskRunsForRun(42);
    expect(mockAll).toHaveBeenCalledWith(42);
  });

  it('returns task run rows', async () => {
    const row = { id: 1, runId: 1, taskId: 'task-1', title: 'T', status: 'done', stage: null, startedAt: null, endedAt: null };
    mockAll.mockReturnValue([row]);
    const { listTaskRunsForRun } = await import('../../src/db/repo.js');
    expect(listTaskRunsForRun(1)).toEqual([row]);
  });
});

describe('createPipeline', () => {
  it('returns new pipeline id', async () => {
    mockRun.mockReturnValueOnce({ lastInsertRowid: 10, changes: 1 });
    const { createPipeline } = await import('../../src/db/repo.js');
    const id = createPipeline('repo-1', 'feat-1', true);
    expect(id).toBe(10);
  });

  it('calls insert with autoAdvance as 1/0', async () => {
    const { createPipeline } = await import('../../src/db/repo.js');
    createPipeline('repo-1', 'feat-1', false);
    expect(mockRun.mock.calls[0]).toContain(0);
    mockRun.mockClear();
    createPipeline('repo-1', 'feat-1', true);
    expect(mockRun.mock.calls[0]).toContain(1);
  });

  it('passes cwd when provided in opts', async () => {
    const { createPipeline } = await import('../../src/db/repo.js');
    createPipeline('repo-1', 'feat-1', true, { cwd: '/workspace' });
    expect(mockRun.mock.calls[0]).toContain('/workspace');
  });

  it('uses null for cwd when not provided', async () => {
    const { createPipeline } = await import('../../src/db/repo.js');
    createPipeline('repo-1', 'feat-1', true);
    expect(mockRun.mock.calls[0]).toContain(null);
  });

  it('encodes snapshot arrays as JSON', async () => {
    const { createPipeline } = await import('../../src/db/repo.js');
    createPipeline('repo-1', 'feat-1', true, {
      snapshot: { plan: ['feat-a', 'feat-b'], done: [], pending: ['feat-a'], active: ['feat-b'], aborted: [] },
    });
    expect(mockRun.mock.calls[0]).toContain(JSON.stringify(['feat-a', 'feat-b']));
    expect(mockRun.mock.calls[0]).toContain(JSON.stringify(['feat-a']));
  });

  it('encodes structural workflow revisions with the pipeline snapshot', async () => {
    const { createPipeline } = await import('../../src/db/repo.js');
    const workflowRevisions = {
      'feat-a': {
        mode: 'staged' as const,
        stages: ['specify', 'plan'],
        syncTasksToBacklog: true,
        sessionPolicy: { mode: 'isolated' as const, alwaysIsolatedStages: ['plan'] },
        stepGuidance: { plan: { prompt: 'Use revision A.' } },
      },
    };
    createPipeline('repo-1', 'feat-a', false, {
      snapshot: { plan: ['feat-a'], done: [], pending: ['feat-a'], active: [], aborted: [], workflowRevisions },
    });
    expect(mockRun.mock.calls[0]).toContain(JSON.stringify(workflowRevisions));
  });
});

describe('updatePipelineStage', () => {
  it('calls run with stage and pipelineId', async () => {
    const { updatePipelineStage } = await import('../../src/db/repo.js');
    updatePipelineStage(5, 'review');
    expect(mockRun).toHaveBeenCalledWith('review', 5);
  });
});

describe('finishPipeline', () => {
  it('calls run with status and pipelineId', async () => {
    const { finishPipeline } = await import('../../src/db/repo.js');
    finishPipeline(3, 'done');
    expect(mockRun).toHaveBeenCalledWith('done', 3);
  });
});

describe('setPipelineStatus', () => {
  it('calls run with status and pipelineId', async () => {
    const { setPipelineStatus } = await import('../../src/db/repo.js');
    setPipelineStatus(1, 'paused');
    expect(mockRun).toHaveBeenCalledWith('paused', 0, 1);
  });

  it('passes clearAbortRequest=1 when opted in', async () => {
    const { setPipelineStatus } = await import('../../src/db/repo.js');
    setPipelineStatus(1, 'running', { clearAbortRequest: true });
    expect(mockRun.mock.calls[0]).toContain(1); // clearAbortRequest → 1
  });
});

describe('pausePipeline', () => {
  it('calls setPipelineStatus with paused', async () => {
    const { pausePipeline } = await import('../../src/db/repo.js');
    pausePipeline(7);
    expect(mockRun).toHaveBeenCalledWith('paused', 0, 7);
  });
});

describe('abortPipeline', () => {
  it('calls setPipelineStatus with aborting', async () => {
    const { abortPipeline } = await import('../../src/db/repo.js');
    abortPipeline(7);
    expect(mockRun).toHaveBeenCalledWith('aborting', 0, 7);
  });
});

describe('requestFeatureAbort', () => {
  it('updates pipeline with featureId and paused status', async () => {
    const { requestFeatureAbort } = await import('../../src/db/repo.js');
    requestFeatureAbort(2, 'feat-x');
    expect(mockRun).toHaveBeenCalledWith('feat-x', 2);
  });
});

describe('getPipeline', () => {
  it('returns null when row not found', async () => {
    mockGet.mockReturnValue(undefined);
    const { getPipeline } = await import('../../src/db/repo.js');
    expect(getPipeline(99)).toBeNull();
  });

  it('returns pipeline row when found', async () => {
    const row = {
      id: 1, repoId: 'r', featureId: 'f', status: 'running', cwd: null,
      currentStage: null, autoAdvance: 1, planJson: '[]', doneJson: '[]',
      pendingJson: '[]', activeJson: '[]', abortedJson: '[]',
      requestedAbortFeatureId: null, resumeCount: 0, resumeSummary: null,
      createdAt: '2024-01-01', updatedAt: '2024-01-01', endedAt: null,
    };
    mockGet.mockReturnValue(row);
    const { getPipeline } = await import('../../src/db/repo.js');
    const result = getPipeline(1);
    expect(result).toBe(row);
  });

  it('queries with pipeline id', async () => {
    mockGet.mockReturnValue(undefined);
    const { getPipeline } = await import('../../src/db/repo.js');
    getPipeline(42);
    expect(mockGet).toHaveBeenCalledWith(42);
  });
});

describe('getPipelineSnapshot', () => {
  it('decodes JSON arrays from pipeline row fields', async () => {
    const { getPipelineSnapshot } = await import('../../src/db/repo.js');
    const row = {
      id: 1, repoId: 'r', featureId: 'f', status: 'running' as const,
      cwd: null, currentStage: null, autoAdvance: 1,
      planJson: '["feat-a","feat-b"]',
      doneJson: '["feat-a"]',
      pendingJson: '["feat-b"]',
      activeJson: '[]',
      abortedJson: '[]',
      workflowSnapshotJson: '{"feat-a":{"mode":"staged","stages":["specify","plan"],"syncTasksToBacklog":true,"sessionPolicy":{"mode":"isolated","alwaysIsolatedStages":["plan"]},"stepGuidance":{"plan":{"prompt":"Use revision A."}}}}',
      requestedAbortFeatureId: null, resumeCount: 0, resumeSummary: null,
      createdAt: '', updatedAt: '', endedAt: null,
    };
    const snapshot = getPipelineSnapshot(row);
    expect(snapshot.plan).toEqual(['feat-a', 'feat-b']);
    expect(snapshot.done).toEqual(['feat-a']);
    expect(snapshot.pending).toEqual(['feat-b']);
    expect(snapshot.active).toEqual([]);
    expect(snapshot.aborted).toEqual([]);
    expect(snapshot.workflowRevisions).toEqual({
      'feat-a': expect.objectContaining({ stages: ['specify', 'plan'] }),
    });
  });

  it('handles null/undefined JSON gracefully', async () => {
    const { getPipelineSnapshot } = await import('../../src/db/repo.js');
    const row = {
      id: 1, repoId: 'r', featureId: 'f', status: 'running' as const,
      cwd: null, currentStage: null, autoAdvance: 1,
      planJson: null as unknown as string,
      doneJson: undefined as unknown as string,
      pendingJson: '',
      activeJson: '[]',
      abortedJson: '[]',
      requestedAbortFeatureId: null, resumeCount: 0, resumeSummary: null,
      createdAt: '', updatedAt: '', endedAt: null,
    };
    const snapshot = getPipelineSnapshot(row);
    expect(snapshot.plan).toEqual([]);
    expect(snapshot.done).toEqual([]);
    expect(snapshot.pending).toEqual([]);
  });

  it('filters non-string entries from JSON arrays', async () => {
    const { getPipelineSnapshot } = await import('../../src/db/repo.js');
    const row = {
      id: 1, repoId: 'r', featureId: 'f', status: 'running' as const,
      cwd: null, currentStage: null, autoAdvance: 1,
      planJson: '[1,"feat-a",null,"feat-b"]',
      doneJson: '[]', pendingJson: '[]', activeJson: '[]', abortedJson: '[]',
      requestedAbortFeatureId: null, resumeCount: 0, resumeSummary: null,
      createdAt: '', updatedAt: '', endedAt: null,
    };
    const snapshot = getPipelineSnapshot(row);
    expect(snapshot.plan).toEqual(['feat-a', 'feat-b']);
  });
});

describe('listResumablePipelines', () => {
  it('returns empty array when no rows', async () => {
    mockAll.mockReturnValue([]);
    const { listResumablePipelines } = await import('../../src/db/repo.js');
    expect(listResumablePipelines()).toEqual([]);
  });

  it('returns pipeline rows', async () => {
    const row = { id: 1, repoId: 'r', featureId: 'f', status: 'paused' };
    mockAll.mockReturnValue([row]);
    const { listResumablePipelines } = await import('../../src/db/repo.js');
    expect(listResumablePipelines()).toEqual([row]);
  });
});

describe('updatePipelineSnapshot', () => {
  it('no-ops when pipeline not found', async () => {
    mockGet.mockReturnValue(undefined);
    const { updatePipelineSnapshot } = await import('../../src/db/repo.js');
    updatePipelineSnapshot(99, { pending: ['feat-a'] });
    // Only the getPipeline query runs, no update
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('updates when pipeline found', async () => {
    const pipelineRow = {
      id: 1, repoId: 'r', featureId: 'f', status: 'running' as const,
      cwd: null, currentStage: null, autoAdvance: 1,
      planJson: '["feat-a"]', doneJson: '[]', pendingJson: '["feat-a"]',
      activeJson: '[]', abortedJson: '[]',
      requestedAbortFeatureId: null, resumeCount: 0, resumeSummary: null,
      createdAt: '', updatedAt: '', endedAt: null,
    };
    mockGet.mockReturnValue(pipelineRow);
    const { updatePipelineSnapshot } = await import('../../src/db/repo.js');
    updatePipelineSnapshot(1, { active: ['feat-a'], pending: [] }, { status: 'running' });
    expect(mockRun).toHaveBeenCalled();
    // Active json should be updated
    expect(mockRun.mock.calls[0]).toContain(JSON.stringify(['feat-a']));
  });

  it('passes clearAbortRequest=null when opted in', async () => {
    const pipelineRow = {
      id: 1, repoId: 'r', featureId: 'f', status: 'paused' as const,
      cwd: null, currentStage: null, autoAdvance: 1,
      planJson: '[]', doneJson: '[]', pendingJson: '[]',
      activeJson: '[]', abortedJson: '[]',
      requestedAbortFeatureId: 'feat-x', resumeCount: 2, resumeSummary: null,
      createdAt: '', updatedAt: '', endedAt: null,
    };
    mockGet.mockReturnValue(pipelineRow);
    const { updatePipelineSnapshot } = await import('../../src/db/repo.js');
    updatePipelineSnapshot(1, {}, { clearAbortRequest: true, status: 'running' });
    // requestedAbortFeatureId should be null (cleared)
    expect(mockRun.mock.calls[0]).toContain(null);
  });
});

describe('createStageRequest', () => {
  it('returns new stage request id', async () => {
    mockRun.mockReturnValueOnce({ lastInsertRowid: 15, changes: 1 });
    const { createStageRequest } = await import('../../src/db/repo.js');
    const id = createStageRequest(1, 'feat-1', 'review', 'approval', 'Approve?');
    expect(id).toBe(15);
  });

  it('emits stage:request-created event', async () => {
    const { createStageRequest } = await import('../../src/db/repo.js');
    createStageRequest(1, 'feat-1', 'review', 'approval', 'Approve?');
    expect(mockEmit).toHaveBeenCalledWith('stage:request-created', expect.objectContaining({
      pipelineId: 1,
      featureId: 'feat-1',
      stage: 'review',
      kind: 'approval',
      prompt: 'Approve?',
    }));
  });

  it('creates resolved request when response is provided', async () => {
    const { createStageRequest } = await import('../../src/db/repo.js');
    createStageRequest(1, 'feat-1', 'review', 'input', 'Enter value:', { response: 'yes' });
    expect(mockRun.mock.calls[0]).toContain('resolved');
    expect(mockRun.mock.calls[0]).toContain('yes');
  });

  it('creates pending request when no response', async () => {
    const { createStageRequest } = await import('../../src/db/repo.js');
    createStageRequest(1, 'feat-1', 'review', 'approval', 'Approve?');
    expect(mockRun.mock.calls[0]).toContain('pending');
  });

  it('serializes options as JSON when provided', async () => {
    const { createStageRequest } = await import('../../src/db/repo.js');
    createStageRequest(1, 'feat-1', 'review', 'input', 'Pick one', { options: ['A', 'B'] });
    expect(mockRun.mock.calls[0]).toContain(JSON.stringify(['A', 'B']));
  });

  it('stores null options when not provided', async () => {
    const { createStageRequest } = await import('../../src/db/repo.js');
    createStageRequest(1, 'feat-1', 'review', 'input', 'Pick one');
    expect(mockRun.mock.calls[0]).toContain(null);
  });

  it('emits stage:request-created with options when provided', async () => {
    const { createStageRequest } = await import('../../src/db/repo.js');
    createStageRequest(1, 'feat-1', 'review', 'input', 'Pick one', { options: ['A', 'B'] });
    expect(mockEmit).toHaveBeenCalledWith('stage:request-created', expect.objectContaining({
      options: ['A', 'B'],
    }));
  });

  it('emits stage:request-created without options when not provided', async () => {
    const { createStageRequest } = await import('../../src/db/repo.js');
    createStageRequest(1, 'feat-1', 'review', 'approval', 'Approve?');
    const call = mockEmit.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call.options).toBeUndefined();
  });
});

describe('resolveStageRequest', () => {
  it('updates stage request with response', async () => {
    const row = { id: 1, kind: 'approval', status: 'pending' };
    mockGet.mockReturnValue(row);
    const { resolveStageRequest } = await import('../../src/db/repo.js');
    resolveStageRequest(1, 'advance');
    expect(mockRun).toHaveBeenCalledWith('advance', 1);
  });

  it('emits stage:request-resolved when row is pending', async () => {
    const row = { id: 1, kind: 'approval', status: 'pending' };
    mockGet.mockReturnValue(row);
    const { resolveStageRequest } = await import('../../src/db/repo.js');
    resolveStageRequest(1, 'advance');
    expect(mockEmit).toHaveBeenCalledWith('stage:request-resolved', expect.objectContaining({
      requestId: 1,
      kind: 'approval',
      response: 'advance',
    }));
  });

  it('does not emit event when row is already resolved', async () => {
    const row = { id: 1, kind: 'approval', status: 'resolved' };
    mockGet.mockReturnValue(row);
    const { resolveStageRequest } = await import('../../src/db/repo.js');
    resolveStageRequest(1, 'advance');
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('does not emit event when row is not found', async () => {
    mockGet.mockReturnValue(null);
    const { resolveStageRequest } = await import('../../src/db/repo.js');
    resolveStageRequest(99, 'advance');
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe('getStageRequest', () => {
  it('returns null when not found', async () => {
    mockGet.mockReturnValue(undefined);
    const { getStageRequest } = await import('../../src/db/repo.js');
    expect(getStageRequest(99)).toBeNull();
  });

  it('returns row when found', async () => {
    const row = { id: 1, pipelineId: 1, runId: null, featureId: 'f', stage: 'review', kind: 'approval', prompt: 'ok?', status: 'pending', response: null, source: 'manual', createdAt: '', resolvedAt: null };
    mockGet.mockReturnValue(row);
    const { getStageRequest } = await import('../../src/db/repo.js');
    expect(getStageRequest(1)).toBe(row);
  });

  it('queries with id', async () => {
    mockGet.mockReturnValue(undefined);
    const { getStageRequest } = await import('../../src/db/repo.js');
    getStageRequest(42);
    expect(mockGet).toHaveBeenCalledWith(42);
  });

  it('decodes a JSON options column into a string array', async () => {
    const row = { id: 1, pipelineId: 1, runId: null, featureId: 'f', stage: 'specify', kind: 'input', prompt: 'pick', options: JSON.stringify(['A', 'B']), status: 'pending', response: null, source: 'manual', createdAt: '', resolvedAt: null };
    mockGet.mockReturnValue(row);
    const { getStageRequest } = await import('../../src/db/repo.js');
    expect(getStageRequest(1)?.options).toEqual(['A', 'B']);
  });

  it('returns undefined options when the column is null', async () => {
    const row = { id: 1, pipelineId: 1, runId: null, featureId: 'f', stage: 'review', kind: 'approval', prompt: 'ok?', options: null, status: 'pending', response: null, source: 'manual', createdAt: '', resolvedAt: null };
    mockGet.mockReturnValue(row);
    const { getStageRequest } = await import('../../src/db/repo.js');
    expect(getStageRequest(1)?.options).toBeUndefined();
  });
});

describe('listPendingStageRequests', () => {
  it('returns empty array when no pending requests', async () => {
    mockAll.mockReturnValue([]);
    const { listPendingStageRequests } = await import('../../src/db/repo.js');
    expect(listPendingStageRequests()).toEqual([]);
  });

  it('returns pending rows', async () => {
    const row = { id: 1, pipelineId: 1, featureId: 'f', kind: 'approval', status: 'pending' };
    mockAll.mockReturnValue([row]);
    const { listPendingStageRequests } = await import('../../src/db/repo.js');
    expect(listPendingStageRequests()).toEqual([row]);
  });
});

describe('listStageRequestsForFeature', () => {
  it('returns empty array when no rows', async () => {
    mockAll.mockReturnValue([]);
    const { listStageRequestsForFeature } = await import('../../src/db/repo.js');
    expect(listStageRequestsForFeature(1, 'feat-1')).toEqual([]);
  });

  it('queries with pipelineId and featureId', async () => {
    mockAll.mockReturnValue([]);
    const { listStageRequestsForFeature } = await import('../../src/db/repo.js');
    listStageRequestsForFeature(5, 'feat-2');
    expect(mockAll).toHaveBeenCalledWith(5, 'feat-2');
  });
});

describe('listPipelineOverviews', () => {
  it('returns empty array when no rows', async () => {
    mockAll.mockReturnValue([]);
    const { listPipelineOverviews } = await import('../../src/db/repo.js');
    expect(listPipelineOverviews()).toEqual([]);
  });

  it('passes limit to .all()', async () => {
    mockAll.mockReturnValue([]);
    const { listPipelineOverviews } = await import('../../src/db/repo.js');
    listPipelineOverviews(10);
    expect(mockAll).toHaveBeenCalledWith(10);
  });
});

describe('findResumablePipeline', () => {
  it('returns null when no resumable pipelines', async () => {
    mockAll.mockReturnValue([]);
    const { findResumablePipeline } = await import('../../src/db/repo.js');
    expect(findResumablePipeline('feat-x')).toBeNull();
  });

  it('matches by featureId', async () => {
    const row = {
      id: 3, repoId: 'r', featureId: 'feat-x', status: 'paused',
      cwd: null, currentStage: null, autoAdvance: 1,
      planJson: '[]', doneJson: '[]', pendingJson: '[]',
      activeJson: '[]', abortedJson: '[]',
      requestedAbortFeatureId: null, resumeCount: 0, resumeSummary: null,
      createdAt: '', updatedAt: '', endedAt: null,
    };
    mockAll.mockReturnValue([row]);
    const { findResumablePipeline } = await import('../../src/db/repo.js');
    const result = findResumablePipeline('feat-x');
    expect(result).toBe(row);
  });

  it('matches by numeric pipeline id', async () => {
    const row = {
      id: 5, repoId: 'r', featureId: 'feat-1', status: 'paused',
      cwd: null, currentStage: null, autoAdvance: 1,
      planJson: '[]', doneJson: '[]', pendingJson: '[]',
      activeJson: '[]', abortedJson: '[]',
      requestedAbortFeatureId: null, resumeCount: 0, resumeSummary: null,
      createdAt: '', updatedAt: '', endedAt: null,
    };
    mockAll.mockReturnValue([row]);
    const { findResumablePipeline } = await import('../../src/db/repo.js');
    const result = findResumablePipeline('5');
    expect(result).toBe(row);
  });
});

describe('listCompletedFeatureIds', () => {
  it('unions done_json across every pipeline row for the repo', async () => {
    const rows = [
      {
        id: 1, repoId: 'repo-1', featureId: 'feat-a', status: 'done',
        cwd: null, currentStage: null, autoAdvance: 1,
        planJson: '["feat-a"]', doneJson: '["feat-a"]', pendingJson: '[]',
        activeJson: '[]', abortedJson: '[]',
        requestedAbortFeatureId: null, resumeCount: 0, resumeSummary: null,
        createdAt: '', updatedAt: '', endedAt: null,
      },
      {
        id: 2, repoId: 'repo-1', featureId: 'feat-b', status: 'failed',
        cwd: null, currentStage: null, autoAdvance: 1,
        planJson: '["feat-b","feat-c"]', doneJson: '["feat-b"]', pendingJson: '[]',
        activeJson: '[]', abortedJson: '["feat-c"]',
        requestedAbortFeatureId: null, resumeCount: 0, resumeSummary: null,
        createdAt: '', updatedAt: '', endedAt: null,
      },
    ];
    mockAll.mockReturnValue(rows);
    const { listCompletedFeatureIds } = await import('../../src/db/repo.js');
    const result = listCompletedFeatureIds('repo-1');
    expect(result).toEqual(new Set(['feat-a', 'feat-b']));
  });

  it('filters pipelines by repo_id', async () => {
    mockAll.mockReturnValue([]);
    const { listCompletedFeatureIds } = await import('../../src/db/repo.js');
    listCompletedFeatureIds('repo-2');
    expect(mockAll).toHaveBeenCalledWith('repo-2');
  });

  it('returns an empty set when the repo has no pipeline rows', async () => {
    mockAll.mockReturnValue([]);
    const { listCompletedFeatureIds } = await import('../../src/db/repo.js');
    expect(listCompletedFeatureIds('repo-empty')).toEqual(new Set());
  });
});

describe('listRunsForTui repo scoping', () => {
  it('filters by repo_id when provided', async () => {
    mockAll.mockReturnValue([]);
    const { listRunsForTui } = await import('../../src/db/repo.js');
    listRunsForTui(50, 'repo-1');
    expect(mockAll).toHaveBeenCalledWith('repo-1', 50);
  });

  it('omits the repo filter when repoId is not provided', async () => {
    mockAll.mockReturnValue([]);
    const { listRunsForTui } = await import('../../src/db/repo.js');
    listRunsForTui(50);
    expect(mockAll).toHaveBeenCalledWith(50);
  });
});
