import { accessSync, constants, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { DB_PATH_ENV, resolveDbPath, ensureDataDir } from '../config/index.js';

let db: Database.Database | null = null;
let dbMode: 'readonly' | 'readwrite' | null = null;

export class DbAccessError extends Error {
  public constructor(
    public readonly dbPath: string,
    detail: string,
  ) {
    super(
      [
        `SQLite database not writable at: ${dbPath}`,
        detail,
        `Fix file/directory permissions or set ${DB_PATH_ENV} to a writable path.`,
        `Example: ${DB_PATH_ENV}=$(pwd)/.metal-squad/app.db msq run --feature feat-1`,
      ].join('\n'),
    );
    this.name = 'DbAccessError';
  }
}

export function assertWritableDbPath(dbPath = resolveDbPath()): void {
  const dataDir = dirname(dbPath);

  try {
    ensureDataDir(dbPath);
  } catch {
    throw new DbAccessError(
      dbPath,
      `Nao foi possivel criar ou acessar o diretório do banco: ${dataDir}`,
    );
  }

  try {
    accessSync(dataDir, constants.W_OK);
  } catch {
    throw new DbAccessError(
      dbPath,
      `Diretório sem permissão de escrita: ${dataDir}`,
    );
  }

  if (!existsSync(dbPath)) return;

  try {
    accessSync(dbPath, constants.W_OK);
  } catch {
    throw new DbAccessError(
      dbPath,
      `Arquivo do banco sem permissão de escrita: ${dbPath}`,
    );
  }
}

export function getDb(mode: 'readonly' | 'readwrite' = 'readwrite'): Database.Database {
  if (db && (dbMode === 'readwrite' || dbMode === mode)) return db;
  if (db) {
    db.close();
    db = null;
    dbMode = null;
  }

  const dbPath = resolveDbPath();

  try {
    if (mode === 'readonly') {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
      dbMode = 'readonly';
      return db;
    }

    assertWritableDbPath(dbPath);
    db = new Database(dbPath);
    dbMode = 'readwrite';
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
    return db;
  } catch (error) {
    db?.close();
    db = null;
    dbMode = null;
    throw toDbAccessError(error, dbPath);
  }
}

export function resetDb(): void {
  if (!db) return;
  db.close();
  db = null;
  dbMode = null;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      repo_id   TEXT PRIMARY KEY,
      path      TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS runs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id    TEXT NOT NULL REFERENCES repos(repo_id),
      feature_id TEXT NOT NULL,
      tool       TEXT NOT NULL,
      pipeline_id INTEGER REFERENCES pipelines(id),
      stage      TEXT,
      status     TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at   TEXT,
      input_tokens INTEGER,
      cached_input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      context_window_tokens INTEGER,
      context_window_percent REAL
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id    INTEGER NOT NULL REFERENCES runs(id),
      input     INTEGER NOT NULL DEFAULT 0,
      cached_input INTEGER NOT NULL DEFAULT 0,
      output    INTEGER NOT NULL DEFAULT 0,
      total     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS gates (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id      INTEGER NOT NULL REFERENCES runs(id),
      feature_id  TEXT NOT NULL,
      repo_id     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      decision    TEXT
    );

    CREATE TABLE IF NOT EXISTS retry_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      attempt INTEGER NOT NULL,
      error TEXT,
      retried_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS run_output (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id     INTEGER NOT NULL REFERENCES runs(id),
      feature_id TEXT NOT NULL,
      tool       TEXT NOT NULL,
      stream     TEXT NOT NULL,
      source     TEXT NOT NULL,
      line       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_runs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id     INTEGER NOT NULL REFERENCES runs(id),
      task_id    TEXT NOT NULL,
      title      TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending',
      stage      TEXT,
      started_at TEXT,
      ended_at   TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      context_window_tokens INTEGER,
      context_window_percent REAL
    );

    CREATE TABLE IF NOT EXISTS pipelines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id     TEXT NOT NULL REFERENCES repos(repo_id),
      feature_id  TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'running',
      cwd         TEXT,
      current_stage TEXT,
      auto_advance INTEGER NOT NULL DEFAULT 0,
      plan_json   TEXT NOT NULL DEFAULT '[]',
      done_json   TEXT NOT NULL DEFAULT '[]',
      pending_json TEXT NOT NULL DEFAULT '[]',
      active_json TEXT NOT NULL DEFAULT '[]',
      aborted_json TEXT NOT NULL DEFAULT '[]',
      requested_abort_feature_id TEXT,
      resume_count INTEGER NOT NULL DEFAULT 0,
      resume_summary TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS run_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id     INTEGER NOT NULL REFERENCES runs(id),
      event      TEXT NOT NULL,
      metadata   TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stage_requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id INTEGER NOT NULL REFERENCES pipelines(id),
      run_id      INTEGER REFERENCES runs(id),
      feature_id  TEXT NOT NULL,
      stage       TEXT NOT NULL,
      kind        TEXT NOT NULL,
      prompt      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      response    TEXT,
      source      TEXT NOT NULL DEFAULT 'manual',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS budget_state (
      key TEXT PRIMARY KEY,
      tokens INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backlog_catalog_meta (
      repo_id       TEXT PRIMARY KEY REFERENCES repos(repo_id),
      repo          TEXT NOT NULL,
      version       INTEGER NOT NULL,
      defaults_json TEXT NOT NULL,
      budget_json   TEXT,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backlog_epics (
      epic_id     TEXT PRIMARY KEY,
      repo_id     TEXT NOT NULL REFERENCES repos(repo_id),
      title       TEXT NOT NULL,
      position    INTEGER NOT NULL,
      data_json   TEXT NOT NULL,
      archived_at TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backlog_features (
      feature_id  TEXT PRIMARY KEY,
      epic_id     TEXT NOT NULL REFERENCES backlog_epics(epic_id),
      repo_id     TEXT NOT NULL REFERENCES repos(repo_id),
      title       TEXT NOT NULL,
      depends_on  TEXT NOT NULL DEFAULT '[]',
      spec_file   TEXT,
      position    INTEGER NOT NULL,
      data_json   TEXT NOT NULL,
      archived_at TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backlog_tasks (
      task_id     TEXT NOT NULL,
      feature_id  TEXT NOT NULL REFERENCES backlog_features(feature_id),
      title       TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'todo',
      position    INTEGER NOT NULL,
      data_json   TEXT NOT NULL,
      archived_at TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (task_id, feature_id)
    );
  `);

  const runColumns = d
    .prepare(`PRAGMA table_info(runs)`)
    .all() as { name?: string }[];
  const hasSummary = runColumns.some((column) => column.name === 'summary');
  if (!hasSummary) {
    d.exec(`ALTER TABLE runs ADD COLUMN summary TEXT`);
  }
  const hasInputTokens = runColumns.some((column) => column.name === 'input_tokens');
  if (!hasInputTokens) {
    d.exec(`ALTER TABLE runs ADD COLUMN input_tokens INTEGER`);
  }
  const hasOutputTokens = runColumns.some((column) => column.name === 'output_tokens');
  if (!hasOutputTokens) {
    d.exec(`ALTER TABLE runs ADD COLUMN output_tokens INTEGER`);
  }
  const hasCachedInputTokens = runColumns.some((column) => column.name === 'cached_input_tokens');
  if (!hasCachedInputTokens) {
    d.exec(`ALTER TABLE runs ADD COLUMN cached_input_tokens INTEGER`);
  }
  const hasTotalTokens = runColumns.some((column) => column.name === 'total_tokens');
  if (!hasTotalTokens) {
    d.exec(`ALTER TABLE runs ADD COLUMN total_tokens INTEGER`);
  }
  const hasContextWindowTokens = runColumns.some((column) => column.name === 'context_window_tokens');
  if (!hasContextWindowTokens) {
    d.exec(`ALTER TABLE runs ADD COLUMN context_window_tokens INTEGER`);
  }
  const hasContextWindowPercent = runColumns.some((column) => column.name === 'context_window_percent');
  if (!hasContextWindowPercent) {
    d.exec(`ALTER TABLE runs ADD COLUMN context_window_percent REAL`);
  }
  const hasPipelineId = runColumns.some((column) => column.name === 'pipeline_id');
  if (!hasPipelineId) {
    d.exec(`ALTER TABLE runs ADD COLUMN pipeline_id INTEGER REFERENCES pipelines(id)`);
  }
  const hasStage = runColumns.some((column) => column.name === 'stage');
  if (!hasStage) {
    d.exec(`ALTER TABLE runs ADD COLUMN stage TEXT`);
  }

  const usageColumns = d
    .prepare(`PRAGMA table_info(token_usage)`)
    .all() as { name?: string }[];
  const hasCachedInputUsage = usageColumns.some((column) => column.name === 'cached_input');
  if (!hasCachedInputUsage) {
    d.exec(`ALTER TABLE token_usage ADD COLUMN cached_input INTEGER NOT NULL DEFAULT 0`);
  }

  const taskRunColumns = d
    .prepare(`PRAGMA table_info(task_runs)`)
    .all() as { name?: string }[];
  const ensureTaskRunColumn = (name: string, sql: string): void => {
    if (!taskRunColumns.some((column) => column.name === name)) {
      d.exec(sql);
    }
  };
  ensureTaskRunColumn('input_tokens', `ALTER TABLE task_runs ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0`);
  ensureTaskRunColumn('cached_input_tokens', `ALTER TABLE task_runs ADD COLUMN cached_input_tokens INTEGER NOT NULL DEFAULT 0`);
  ensureTaskRunColumn('output_tokens', `ALTER TABLE task_runs ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0`);
  ensureTaskRunColumn('total_tokens', `ALTER TABLE task_runs ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0`);
  ensureTaskRunColumn('context_window_tokens', `ALTER TABLE task_runs ADD COLUMN context_window_tokens INTEGER`);
  ensureTaskRunColumn('context_window_percent', `ALTER TABLE task_runs ADD COLUMN context_window_percent REAL`);

  const pipelineColumns = d
    .prepare(`PRAGMA table_info(pipelines)`)
    .all() as { name?: string }[];
  const ensurePipelineColumn = (name: string, sql: string): void => {
    if (!pipelineColumns.some((column) => column.name === name)) {
      d.exec(sql);
      pipelineColumns.push({ name });
    }
  };
  ensurePipelineColumn('cwd', `ALTER TABLE pipelines ADD COLUMN cwd TEXT`);
  ensurePipelineColumn('plan_json', `ALTER TABLE pipelines ADD COLUMN plan_json TEXT NOT NULL DEFAULT '[]'`);
  ensurePipelineColumn('done_json', `ALTER TABLE pipelines ADD COLUMN done_json TEXT NOT NULL DEFAULT '[]'`);
  ensurePipelineColumn('pending_json', `ALTER TABLE pipelines ADD COLUMN pending_json TEXT NOT NULL DEFAULT '[]'`);
  ensurePipelineColumn('active_json', `ALTER TABLE pipelines ADD COLUMN active_json TEXT NOT NULL DEFAULT '[]'`);
  ensurePipelineColumn('aborted_json', `ALTER TABLE pipelines ADD COLUMN aborted_json TEXT NOT NULL DEFAULT '[]'`);
  ensurePipelineColumn('requested_abort_feature_id', `ALTER TABLE pipelines ADD COLUMN requested_abort_feature_id TEXT`);
  ensurePipelineColumn('resume_count', `ALTER TABLE pipelines ADD COLUMN resume_count INTEGER NOT NULL DEFAULT 0`);
  ensurePipelineColumn('resume_summary', `ALTER TABLE pipelines ADD COLUMN resume_summary TEXT`);
}

function toDbAccessError(error: unknown, dbPath: string): Error {
  if (error instanceof DbAccessError) return error;

  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes('readonly database')
    || message.includes('SQLITE_READONLY')
    || message.includes('SQLITE_CANTOPEN')
    || message.includes('SQLITE_PERM')
  ) {
    return new DbAccessError(
      dbPath,
      `Falha ao abrir o banco em modo leitura/escrita: ${message}`,
    );
  }

  return error instanceof Error ? error : new Error(message);
}
