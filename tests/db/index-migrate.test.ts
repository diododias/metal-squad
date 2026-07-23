import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-call prepare mock: returns different column sets based on SQL
let prepareCallIndex = 0;
let pragmaRunsColumns: Array<{ name: string }> = [];
let pragmaTokenUsageColumns: Array<{ name: string }> = [];
let pragmaTaskRunColumns: Array<{ name: string }> = [];
let pragmaPipelinesColumns: Array<{ name: string }> = [];
let pragmaRetryHistoryColumns: Array<{ name: string }> = [];
let pragmaStageRequestColumns: Array<{ name: string }> = [];
let pragmaRunOutputColumns: Array<{ name: string }> = [];
let pragmaBacklogEpicsColumns: Array<{ name: string }> = [];
let pragmaBacklogFeaturesColumns: Array<{ name: string }> = [];
const mockExecCalls: string[] = [];

const mockExec = vi.fn((sql: string) => { mockExecCalls.push(sql); });
const mockPragma = vi.fn();
const mockClose = vi.fn();

function makeMockAll(columns: Array<{ name: string }>) {
  return vi.fn(() => columns);
}

const mockPrepare = vi.fn((sql: string) => {
  if (sql.includes('PRAGMA table_info(runs)')) {
    return { all: makeMockAll(pragmaRunsColumns), run: vi.fn(), get: vi.fn() };
  }
  if (sql.includes('PRAGMA table_info(token_usage)')) {
    return { all: makeMockAll(pragmaTokenUsageColumns), run: vi.fn(), get: vi.fn() };
  }
  if (sql.includes('PRAGMA table_info(task_runs)')) {
    return { all: makeMockAll(pragmaTaskRunColumns), run: vi.fn(), get: vi.fn() };
  }
  if (sql.includes('PRAGMA table_info(pipelines)')) {
    return { all: makeMockAll(pragmaPipelinesColumns), run: vi.fn(), get: vi.fn() };
  }
  if (sql.includes('PRAGMA table_info(retry_history)')) {
    return { all: makeMockAll(pragmaRetryHistoryColumns), run: vi.fn(), get: vi.fn() };
  }
  if (sql.includes('PRAGMA table_info(stage_requests)')) {
    return { all: makeMockAll(pragmaStageRequestColumns), run: vi.fn(), get: vi.fn() };
  }
  if (sql.includes('PRAGMA table_info(run_output)')) {
    return { all: makeMockAll(pragmaRunOutputColumns), run: vi.fn(), get: vi.fn() };
  }
  if (sql.includes('PRAGMA table_info(backlog_epics)')) {
    return { all: makeMockAll(pragmaBacklogEpicsColumns), run: vi.fn(), get: vi.fn() };
  }
  if (sql.includes('PRAGMA table_info(backlog_features)')) {
    return { all: makeMockAll(pragmaBacklogFeaturesColumns), run: vi.fn(), get: vi.fn() };
  }
  return { all: vi.fn(() => []), run: vi.fn(), get: vi.fn() };
});

const mockDb = { prepare: mockPrepare, pragma: mockPragma, exec: mockExec, close: mockClose };
const mockDatabase = vi.fn(() => mockDb);
const mockResolveDbPath = vi.fn(() => ':memory:');
const mockEnsureDataDir = vi.fn();
const mockAccessSync = vi.fn();
const mockExistsSync = vi.fn(() => false);

vi.mock('better-sqlite3', () => ({ default: mockDatabase }));
vi.mock('../../src/config/index.js', () => ({
  DB_PATH_ENV: 'MSQ_DB_PATH',
  resolveDbPath: mockResolveDbPath,
  ensureDataDir: mockEnsureDataDir,
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, accessSync: mockAccessSync, existsSync: mockExistsSync };
});

function resetAll() {
  prepareCallIndex = 0;
  pragmaRunsColumns = [];
  pragmaTokenUsageColumns = [];
  pragmaTaskRunColumns = [
    { name: 'input_tokens' },
    { name: 'cached_input_tokens' },
    { name: 'output_tokens' },
    { name: 'total_tokens' },
    { name: 'context_window_tokens' },
    { name: 'context_window_percent' },
    { name: 'token_data_quality' },
  ];
  pragmaPipelinesColumns = [];
  pragmaRetryHistoryColumns = [{ name: 'tool' }, { name: 'model' }];
  pragmaStageRequestColumns = [{ name: 'options' }];
  pragmaRunOutputColumns = [];
  pragmaBacklogEpicsColumns = [];
  pragmaBacklogFeaturesColumns = [];
  mockExecCalls.length = 0;
  mockDatabase.mockReset();
  mockDatabase.mockReturnValue(mockDb);
  mockPrepare.mockClear();
  mockPragma.mockReset();
  mockExec.mockReset();
  mockExec.mockImplementation((sql: string) => { mockExecCalls.push(sql); });
  mockClose.mockReset();
  mockEnsureDataDir.mockReset();
  mockAccessSync.mockReset();
  mockExistsSync.mockReset();
  mockExistsSync.mockReturnValue(false);
  mockResolveDbPath.mockReturnValue(':memory:');
}

beforeEach(() => {
  vi.resetModules();
  resetAll();
});

describe('getDb migration — column checks', () => {
  it('does not alter runs table when all migration columns already exist', async () => {
    const ALL_RUN_COLS = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' },
      { name: 'context_window_tokens' }, { name: 'context_window_percent' }, { name: 'token_data_quality' }, { name: 'stage' },
      { name: 'publish_verified' }, { name: 'publish_error' }, { name: 'branch_name' },
      { name: 'base_branch' }, { name: 'commit_sha' }, { name: 'remote_branch' },
      { name: 'pr_number' }, { name: 'pr_url' },
      { name: 'session_status' }, { name: 'session_started_at' }, { name: 'session_updated_at' },
      { name: 'session_elapsed_ms' }, { name: 'session_last_output_at' }, { name: 'session_idle_ms' },
      { name: 'session_reason' }, { name: 'session_terminal' }, { name: 'project_id' },
      { name: 'adapter_session_tool' }, { name: 'adapter_session_id' },
    ];
    pragmaRunsColumns = ALL_RUN_COLS;
    pragmaTokenUsageColumns = [{ name: 'cached_input' }, { name: 'data_quality' }, { name: 'raw_usage_json' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' },
      { name: 'pending_json' }, { name: 'active_json' }, { name: 'aborted_json' },
      { name: 'workflow_snapshot_json' },
      { name: 'requested_abort_feature_id' }, { name: 'resume_count' }, { name: 'resume_summary' },
      { name: 'project_id' },
    ];
    pragmaRunOutputColumns = [{ name: 'tool_name' }, { name: 'level' }];
    pragmaBacklogEpicsColumns = [
      { name: 'project_id' }, { name: 'description' }, { name: 'status' },
      { name: 'deleted_at' }, { name: 'revision' },
    ];
    pragmaBacklogFeaturesColumns = [
      { name: 'description' }, { name: 'deleted_at' }, { name: 'revision' },
      { name: 'type' },
    ];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls).toHaveLength(0);
  });

  it('creates the stage_transition_decisions table in the base schema', async () => {
    pragmaRunsColumns = [];
    pragmaTokenUsageColumns = [];
    pragmaPipelinesColumns = [];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    expect(mockExecCalls.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS stage_transition_decisions'))).toBe(true);
  });

  it('alters runs table when summary column is missing', async () => {
    pragmaRunsColumns = [
      { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('ADD COLUMN summary'))).toBe(true);
    expect(alterCalls.some((s) => s.includes('ADD COLUMN input_tokens'))).toBe(false);
  });

  it('alters runs table when input_tokens column is missing', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('ADD COLUMN input_tokens'))).toBe(true);
  });

  it('alters runs table when output_tokens column is missing', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('ADD COLUMN output_tokens'))).toBe(true);
    expect(alterCalls.some((s) => s.includes('ADD COLUMN input_tokens'))).toBe(false);
  });

  it('alters runs table when cached_input_tokens column is missing', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'total_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('ADD COLUMN cached_input_tokens'))).toBe(true);
  });

  it('alters runs table when total_tokens column is missing', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('ADD COLUMN total_tokens'))).toBe(true);
  });

  it('alters runs table when pipeline_id column is missing', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('ADD COLUMN pipeline_id'))).toBe(true);
  });

  it('alters runs table when stage column is missing', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('ADD COLUMN stage TEXT'))).toBe(true);
  });

  it('alters token_usage when cached_input column is missing', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = []; // missing cached_input
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('cached_input'))).toBe(true);
  });

  it('does not alter token_usage when cached_input already exists', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('cached_input'))).toBe(false);
  });

  it('alters pipelines when cwd column is missing', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('ADD COLUMN cwd'))).toBe(true);
  });

  it('alters pipelines when resume_count column is missing', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_summary' },
    ];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('ADD COLUMN resume_count'))).toBe(true);
  });

  it('alters retry_history when tool/model columns are missing', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];
    pragmaRetryHistoryColumns = [];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('ALTER TABLE retry_history ADD COLUMN tool'))).toBe(true);
    expect(alterCalls.some((s) => s.includes('ALTER TABLE retry_history ADD COLUMN model'))).toBe(true);
  });

  it('does not alter retry_history when tool/model already exist', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];
    pragmaRetryHistoryColumns = [{ name: 'tool' }, { name: 'model' }];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('retry_history'))).toBe(false);
  });

  it('alters stage_requests when options column is missing', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];
    pragmaStageRequestColumns = [];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('ALTER TABLE stage_requests ADD COLUMN options TEXT'))).toBe(true);
  });

  it('does not alter stage_requests when options column already exists (idempotent on second call)', async () => {
    pragmaRunsColumns = [
      { name: 'summary' }, { name: 'input_tokens' }, { name: 'output_tokens' },
      { name: 'cached_input_tokens' }, { name: 'total_tokens' }, { name: 'pipeline_id' }, { name: 'stage' },
    ];
    pragmaTokenUsageColumns = [{ name: 'cached_input' }];
    pragmaPipelinesColumns = [
      { name: 'cwd' }, { name: 'plan_json' }, { name: 'done_json' }, { name: 'pending_json' },
      { name: 'active_json' }, { name: 'aborted_json' }, { name: 'requested_abort_feature_id' },
      { name: 'resume_count' }, { name: 'resume_summary' },
    ];
    pragmaStageRequestColumns = [{ name: 'options' }];

    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');
    getDb('readwrite');

    const alterCalls = mockExecCalls.filter((s) => s.trim().startsWith('ALTER'));
    expect(alterCalls.some((s) => s.includes('stage_requests'))).toBe(false);
  });
});

describe('getDb error handling — toDbAccessError', () => {
  it('wraps SQLITE_READONLY error in DbAccessError', async () => {
    const sqliteError = new Error('database is readonly (SQLITE_READONLY)');
    mockDatabase.mockImplementation(() => { throw sqliteError; });

    const { getDb, DbAccessError } = await import('../../src/db/index.js');
    expect(() => getDb('readwrite')).toThrow(DbAccessError);
  });

  it('wraps SQLITE_CANTOPEN error in DbAccessError', async () => {
    mockDatabase.mockImplementation(() => {
      throw new Error('unable to open database file (SQLITE_CANTOPEN)');
    });

    const { getDb, DbAccessError } = await import('../../src/db/index.js');
    expect(() => getDb('readwrite')).toThrow(DbAccessError);
  });

  it('wraps SQLITE_PERM error in DbAccessError', async () => {
    mockDatabase.mockImplementation(() => {
      throw new Error('permission denied (SQLITE_PERM)');
    });

    const { getDb, DbAccessError } = await import('../../src/db/index.js');
    expect(() => getDb('readwrite')).toThrow(DbAccessError);
  });

  it('wraps readonly database error in DbAccessError', async () => {
    mockDatabase.mockImplementation(() => {
      throw new Error('attempt to write a readonly database');
    });

    const { getDb, DbAccessError } = await import('../../src/db/index.js');
    expect(() => getDb('readwrite')).toThrow(DbAccessError);
  });

  it('re-throws unknown Error as-is when not SQLITE error', async () => {
    const unknownError = new Error('some random error');
    mockDatabase.mockImplementation(() => { throw unknownError; });

    const { getDb, DbAccessError } = await import('../../src/db/index.js');
    try {
      getDb('readwrite');
      expect.fail('should throw');
    } catch (err) {
      expect(err).not.toBeInstanceOf(DbAccessError);
      expect(err).toBe(unknownError);
    }
  });

  it('wraps non-Error throw as new Error', async () => {
    mockDatabase.mockImplementation(() => { throw 'string error'; });

    const { getDb } = await import('../../src/db/index.js');
    try {
      getDb('readwrite');
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('returns original DbAccessError without rewrapping', async () => {
    // assertWritableDbPath throws DbAccessError → toDbAccessError should return it as-is
    mockEnsureDataDir.mockImplementation(() => { throw new Error('fail'); });

    const { getDb, DbAccessError } = await import('../../src/db/index.js');
    let thrown: unknown;
    try {
      getDb('readwrite');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DbAccessError);
  });

  it('closes db before rethrowing when database creation throws', async () => {
    // First call creates db, second call throws during pragma
    mockDatabase.mockReturnValue(mockDb);
    mockPragma.mockImplementationOnce(() => {}) // journal_mode
      .mockImplementationOnce(() => { throw new Error('SQLITE_READONLY'); }); // foreign_keys

    const { getDb } = await import('../../src/db/index.js');
    try {
      getDb('readwrite');
    } catch {}

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
