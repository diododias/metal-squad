import { accessSync, constants, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { DB_PATH_ENV, resolveDbPath, ensureDataDir } from '../config/index.js';

let db: Database.Database | null = null;
let dbMode: 'readonly' | 'readwrite' | null = null;

export class DbAccessError extends Error {
  constructor(
    readonly dbPath: string,
    detail: string,
  ) {
    super(
      [
        `Banco SQLite sem escrita em: ${dbPath}`,
        detail,
        `Corrija as permissões do arquivo/diretório ou defina ${DB_PATH_ENV} para um caminho gravável.`,
        `Exemplo: ${DB_PATH_ENV}=$(pwd)/.metal-squad/app.db msq run --feature feat-1`,
      ].join('\n'),
    );
    this.name = 'DbAccessError';
  }
}

export function assertWritableDbPath(dbPath = resolveDbPath()): void {
  const dataDir = dirname(dbPath);

  try {
    ensureDataDir(dbPath);
  } catch (error) {
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
      output_tokens INTEGER,
      total_tokens INTEGER
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id    INTEGER NOT NULL REFERENCES runs(id),
      input     INTEGER NOT NULL DEFAULT 0,
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
      ended_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS pipelines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id     TEXT NOT NULL REFERENCES repos(repo_id),
      feature_id  TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'running',
      current_stage TEXT,
      auto_advance INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at    TEXT
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
  `);

  const runColumns = (d
    .prepare(`PRAGMA table_info(runs)`)
    .all() ?? []) as Array<{ name?: string }>;
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
  const hasTotalTokens = runColumns.some((column) => column.name === 'total_tokens');
  if (!hasTotalTokens) {
    d.exec(`ALTER TABLE runs ADD COLUMN total_tokens INTEGER`);
  }
  const hasPipelineId = runColumns.some((column) => column.name === 'pipeline_id');
  if (!hasPipelineId) {
    d.exec(`ALTER TABLE runs ADD COLUMN pipeline_id INTEGER REFERENCES pipelines(id)`);
  }
  const hasStage = runColumns.some((column) => column.name === 'stage');
  if (!hasStage) {
    d.exec(`ALTER TABLE runs ADD COLUMN stage TEXT`);
  }
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
