import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock better-sqlite3 before importing db modules
const mockAll = vi.fn();
const mockRun = vi.fn();
const mockGet = vi.fn();
const mockPrepare = vi.fn(() => ({ all: mockAll, run: mockRun, get: mockGet }));
const mockPragma = vi.fn();
const mockExec = vi.fn();
const mockDb = { prepare: mockPrepare, pragma: mockPragma, exec: mockExec };
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
