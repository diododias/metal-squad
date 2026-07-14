import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock better-sqlite3 before importing db modules
const mockAll = vi.fn();
const mockRun = vi.fn();
const mockGet = vi.fn();
const mockRunColumnsAll = vi.fn();
const mockPrepare = vi.fn(() => ({ all: mockAll, run: mockRun, get: mockGet }));
const mockPragma = vi.fn();
const mockExec = vi.fn();
const mockClose = vi.fn();
const mockDb = { prepare: mockPrepare, pragma: mockPragma, exec: mockExec, close: mockClose };

mockAll.mockReturnValue([]);
const mockDatabase = vi.fn(() => mockDb);

vi.mock('better-sqlite3', () => ({ default: mockDatabase }));
vi.mock('../../src/config/index.js', () => ({
  DB_PATH: ':memory:',
  ensureDataDir: vi.fn(),
  resolveDbPath: vi.fn(() => ':memory:'),
}));

// Reset DB singleton between tests
beforeEach(async () => {
  vi.resetModules();
  mockAll.mockReset();
  mockRun.mockReset();
  mockGet.mockReset();
  mockRunColumnsAll.mockReset();
  mockAll.mockReturnValue([]);
  mockRunColumnsAll.mockReturnValue([]);
  mockPrepare.mockImplementation(() => ({ all: mockAll, run: mockRun, get: mockGet }));
});

// T014: listRunsForTui tests
describe('listRunsForTui', () => {
  it('returns empty array when no runs', async () => {
    mockAll.mockReturnValue([]);
    const { listRunsForTui } = await import('../../src/db/repo.js');
    const result = listRunsForTui();
    expect(result).toEqual([]);
  });

  it('returns running row with null totalTokens', async () => {
    const row = {
      runId: 1,
      repoId: 'repo1',
      featureId: 'feat-1',
      tool: 'claude',
      status: 'running',
      startedAt: '2026-07-06T10:00:00',
      endedAt: null,
      totalTokens: null,
      inputTokens: null,
      outputTokens: null,
      gateId: null,
      gateDecision: null,
    };
    mockAll.mockReturnValue([row]);
    const { listRunsForTui } = await import('../../src/db/repo.js');
    const result = listRunsForTui();
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('running');
    expect(result[0]!.totalTokens).toBeNull();
  });

  it('returns done row with totalTokens', async () => {
    const row = {
      runId: 2,
      repoId: 'repo1',
      featureId: 'feat-2',
      tool: 'claude',
      status: 'done',
      startedAt: '2026-07-06T10:00:00',
      endedAt: '2026-07-06T10:05:00',
      totalTokens: 1200,
      inputTokens: 900,
      outputTokens: 300,
      gateId: null,
      gateDecision: null,
    };
    mockAll.mockReturnValue([row]);
    const { listRunsForTui } = await import('../../src/db/repo.js');
    const result = listRunsForTui(10);
    expect(result[0]!.totalTokens).toBe(1200);
    expect(result[0]!.status).toBe('done');
  });

  it('falls back to NULL publish metadata when the runs schema is older than the query', async () => {
    const row = {
      runId: 15,
      repoId: 'repo1',
      featureId: 'feat-15',
      tool: 'codex',
      status: 'done',
      startedAt: '2026-07-14T15:05:44',
      endedAt: '2026-07-14T15:24:36',
      totalTokens: 123,
      inputTokens: 100,
      outputTokens: 23,
      gateId: null,
      gateDecision: null,
      publishVerified: null,
      publishError: null,
      branchName: null,
      baseBranch: null,
      commitSha: null,
      remoteBranch: null,
      prNumber: null,
      prUrl: null,
    };
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('PRAGMA table_info(runs)')) {
        return { all: mockRunColumnsAll, run: mockRun, get: mockGet };
      }
      return { all: mockAll, run: mockRun, get: mockGet };
    });
    mockRunColumnsAll.mockReturnValue([
      { name: 'id' },
      { name: 'repo_id' },
      { name: 'feature_id' },
      { name: 'tool' },
      { name: 'status' },
      { name: 'started_at' },
      { name: 'ended_at' },
    ]);
    mockAll.mockReturnValue([row]);

    const { listRunsForTui } = await import('../../src/db/repo.js');
    const result = listRunsForTui();

    expect(result).toHaveLength(1);
    expect(result[0]!.publishVerified).toBeNull();
    expect(result[0]!.branchName).toBeNull();
    expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('NULL AS publishVerified'));
    expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('NULL AS prUrl'));
  });
});

// T017: token formatting + deduplication
describe('formatTokens', () => {
  it('formats null as dash', async () => {
    const { formatTokens } = await import('../../src/ui/format.js');
    expect(formatTokens(null)).toBe('—');
  });

  it('formats small numbers as-is', async () => {
    const { formatTokens } = await import('../../src/ui/format.js');
    expect(formatTokens(500)).toBe('500');
  });

  it('formats thousands as Xk', async () => {
    const { formatTokens } = await import('../../src/ui/format.js');
    expect(formatTokens(1200)).toBe('1.2k');
    expect(formatTokens(5000)).toBe('5.0k');
  });
});

describe('listRunsForTui deduplication', () => {
  it('passes limit to prepare', async () => {
    mockAll.mockReturnValue([]);
    const { listRunsForTui } = await import('../../src/db/repo.js');
    listRunsForTui(25);
    expect(mockAll).toHaveBeenCalledWith(25);
  });
});

describe('live run persistence helpers', () => {
  it('updates live token columns on the run row', async () => {
    const { updateRunUsage } = await import('../../src/db/repo.js');
    updateRunUsage(9, { input: 10, output: 4, total: 14 });
    expect(mockRun).toHaveBeenCalledWith(10, null, 4, 14, 9);
  });

  it('appends streamed output rows', async () => {
    const { appendRunOutput } = await import('../../src/db/repo.js');
    appendRunOutput({
      runId: 9,
      featureId: 'feat-9',
      tool: 'codex',
      line: 'tool write_file {"path":"src/ui/App.tsx"}',
      stream: 'stdout',
      source: 'tool',
    });
    expect(mockRun).toHaveBeenCalledWith(
      9,
      'feat-9',
      'codex',
      'stdout',
      'tool',
      'tool write_file {"path":"src/ui/App.tsx"}',
    );
  });

  it('lists the stored run output tail', async () => {
    mockAll.mockReturnValue([{ id: 1, line: 'done' }]);
    const { listRunOutput } = await import('../../src/db/repo.js');
    expect(listRunOutput(7, 20)).toEqual([{ id: 1, line: 'done' }]);
    expect(mockAll).toHaveBeenCalledWith(7, 20);
  });

  it('stores context query rows', async () => {
    const { recordContextQuery } = await import('../../src/db/repo.js');
    recordContextQuery({
      runId: 9,
      featureId: 'feat-9',
      tool: 'codex',
      queryTool: 'dora',
      kind: 'structured',
      target: 'src/core/events',
      observedBytes: 120,
      latencyMs: 35,
      cacheHit: true,
      rawLine: 'tool mcp__dora__search {"query":"src/core/events"}',
    });
    expect(mockRun).toHaveBeenCalledWith(
      9,
      'feat-9',
      'codex',
      'dora',
      'structured',
      'src/core/events',
      120,
      35,
      1,
      'tool mcp__dora__search {"query":"src/core/events"}',
    );
  });

  it('summarizes context query mix for a run', async () => {
    mockAll.mockReturnValue([
      { queryTool: 'dora', observedBytes: 100, cacheHit: 1 },
      { queryTool: 'serena', observedBytes: 50, cacheHit: null },
      { queryTool: 'shell', observedBytes: 25, cacheHit: 0 },
    ]);
    const { summarizeRunContextQueries } = await import('../../src/db/repo.js');
    expect(summarizeRunContextQueries(7)).toEqual({
      totalQueries: 3,
      doraQueries: 1,
      serenaQueries: 1,
      shellReads: 1,
      structuredRate: 2 / 3,
      observedBytes: 175,
      cacheHits: 1,
      cacheMisses: 1,
    });
  });
});

// T022: openGates, resolveGate (idempotency), createGate
describe('openGates', () => {
  it('returns empty when no open gates', async () => {
    mockAll.mockReturnValue([]);
    const { openGates } = await import('../../src/db/repo.js');
    expect(openGates()).toEqual([]);
  });

  it('returns open gate rows', async () => {
    const gate = {
      id: 1,
      runId: 1,
      featureId: 'feat-1',
      repoId: 'repo1',
      createdAt: '2026-07-06T10:00:00',
      resolvedAt: null,
      decision: null,
    };
    mockAll.mockReturnValue([gate]);
    const { openGates } = await import('../../src/db/repo.js');
    const result = openGates();
    expect(result[0]!.id).toBe(1);
    expect(result[0]!.resolvedAt).toBeNull();
  });
});

describe('resolveGate', () => {
  it('calls UPDATE with correct args (idempotent — no-op if already resolved)', async () => {
    mockRun.mockReturnValue({ changes: 1 });
    const { resolveGate } = await import('../../src/db/repo.js');
    resolveGate(1, 'approved');
    expect(mockRun).toHaveBeenCalledWith('approved', 1);
  });

  it('no-op if already resolved (changes = 0, no throw)', async () => {
    mockRun.mockReturnValue({ changes: 0 });
    const { resolveGate } = await import('../../src/db/repo.js');
    expect(() => resolveGate(1, 'approved')).not.toThrow();
  });
});

describe('createGate', () => {
  it('returns new gate id', async () => {
    mockRun.mockReturnValue({ lastInsertRowid: 42 });
    const { createGate } = await import('../../src/db/repo.js');
    const id = createGate(10, 'feat-1', 'repo1');
    expect(id).toBe(42);
    expect(mockRun).toHaveBeenCalledWith(10, 'feat-1', 'repo1');
  });
});

// F34 item 1: listRunHistoryForFeature returns every run for a feature
// (not deduplicated to the latest one like listRunsForTui).
describe('listRunHistoryForFeature', () => {
  it('returns empty array when no runs', async () => {
    mockAll.mockReturnValue([]);
    const { listRunHistoryForFeature } = await import('../../src/db/repo.js');
    expect(listRunHistoryForFeature('repo1', 'feat-1')).toEqual([]);
  });

  it('passes repoId, featureId and limit to the query, ordered by started_at DESC', async () => {
    const rows = [
      { runId: 3, repoId: 'repo1', featureId: 'feat-1', tool: 'claude', stage: 'implement', status: 'failed', startedAt: '2026-07-08T10:00:00', endedAt: '2026-07-08T10:05:00', totalTokens: 500, pipelineResumeSummary: null },
      { runId: 1, repoId: 'repo1', featureId: 'feat-1', tool: 'claude', stage: 'specify', status: 'done', startedAt: '2026-07-06T10:00:00', endedAt: '2026-07-06T10:05:00', totalTokens: 1200, pipelineResumeSummary: null },
    ];
    mockAll.mockReturnValue(rows);
    const { listRunHistoryForFeature } = await import('../../src/db/repo.js');
    const result = listRunHistoryForFeature('repo1', 'feat-1', 5);
    expect(mockAll).toHaveBeenCalledWith('repo1', 'feat-1', 5);
    expect(result).toEqual(rows);
  });

  it('defaults limit to 20', async () => {
    mockAll.mockReturnValue([]);
    const { listRunHistoryForFeature } = await import('../../src/db/repo.js');
    listRunHistoryForFeature('repo1', 'feat-1');
    expect(mockAll).toHaveBeenCalledWith('repo1', 'feat-1', 20);
  });
});

// F34 item 5c: historical token estimate by tool.
describe('getHistoricalTokenStatsForFeatureProfile', () => {
  it('returns zeroed stats when there are no completed runs', async () => {
    mockAll.mockReturnValue([]);
    const { getHistoricalTokenStatsForFeatureProfile } = await import('../../src/db/repo.js');
    expect(getHistoricalTokenStatsForFeatureProfile('claude')).toEqual({
      sampleSize: 0,
      avgTotalTokens: null,
      medianTotalTokens: null,
    });
  });

  it('computes average and median total tokens across completed runs for the tool', async () => {
    mockAll.mockReturnValue([{ totalTokens: 100 }, { totalTokens: 300 }, { totalTokens: 200 }]);
    const { getHistoricalTokenStatsForFeatureProfile } = await import('../../src/db/repo.js');
    const result = getHistoricalTokenStatsForFeatureProfile('claude');
    expect(result.sampleSize).toBe(3);
    expect(result.avgTotalTokens).toBe(200);
    expect(result.medianTotalTokens).toBe(200);
    expect(mockAll).toHaveBeenCalledWith('claude');
  });

  it('ignores null totalTokens values', async () => {
    mockAll.mockReturnValue([{ totalTokens: null }, { totalTokens: 100 }]);
    const { getHistoricalTokenStatsForFeatureProfile } = await import('../../src/db/repo.js');
    const result = getHistoricalTokenStatsForFeatureProfile('codex');
    expect(result.sampleSize).toBe(1);
    expect(result.avgTotalTokens).toBe(100);
  });
});

// F39 T012: createRetryRecord persisting tool/model, updateRunTool
describe('createRetryRecord', () => {
  it('inserts tool and model alongside run_id/attempt/error', async () => {
    mockRun.mockReturnValue({ lastInsertRowid: 1 });
    const { createRetryRecord } = await import('../../src/db/repo.js');
    createRetryRecord(7, 1, 'falha 1', 5000, 'codex', 'gpt-4o');
    expect(mockRun).toHaveBeenCalledWith(7, 1, 'falha 1', 'codex', 'gpt-4o');
  });

  it('inserts null tool/model when not provided (legacy call shape)', async () => {
    mockRun.mockReturnValue({ lastInsertRowid: 1 });
    const { createRetryRecord } = await import('../../src/db/repo.js');
    createRetryRecord(7, 1, 'falha 1', 5000);
    expect(mockRun).toHaveBeenCalledWith(7, 1, 'falha 1', null, null);
  });
});

describe('updateRunTool', () => {
  it('updates the tool column for the given run', async () => {
    const { updateRunTool } = await import('../../src/db/repo.js');
    updateRunTool(7, 'codex');
    expect(mockRun).toHaveBeenCalledWith('codex', 7);
  });
});

describe('listRetryHistory', () => {
  it('returns empty array when no attempts recorded', async () => {
    mockAll.mockReturnValue([]);
    const { listRetryHistory } = await import('../../src/db/repo.js');
    expect(listRetryHistory(7)).toEqual([]);
  });

  it('returns attempt/tool/model rows ordered by attempt, distinguishing legacy null rows', async () => {
    const rows = [
      { attempt: 1, error: 'falha 1', retriedAt: '2026-07-06T10:00:00', tool: null, model: null },
      { attempt: 2, error: 'falha 2', retriedAt: '2026-07-06T10:01:00', tool: 'codex', model: 'gpt-4o' },
    ];
    mockAll.mockReturnValue(rows);
    const { listRetryHistory } = await import('../../src/db/repo.js');
    const result = listRetryHistory(7);
    expect(mockAll).toHaveBeenCalledWith(7);
    expect(result).toEqual(rows);
    expect(result[0]!.tool).toBeNull();
    expect(result[1]!.tool).toBe('codex');
  });
});

describe('getRunAccumulatedTokens', () => {
  it('sums token_usage across all attempts of the same run_id', async () => {
    mockGet.mockReturnValue({ total: 300 });
    const { getRunAccumulatedTokens } = await import('../../src/db/repo.js');
    expect(getRunAccumulatedTokens(7)).toBe(300);
    expect(mockGet).toHaveBeenCalledWith(7);
  });

  it('returns 0 when no attempts were recorded for the run', async () => {
    mockGet.mockReturnValue({ total: 0 });
    const { getRunAccumulatedTokens } = await import('../../src/db/repo.js');
    expect(getRunAccumulatedTokens(99)).toBe(0);
  });
});
