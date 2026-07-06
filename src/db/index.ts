import Database from 'better-sqlite3';
import { DB_PATH, ensureDataDir } from '../config/index.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  ensureDataDir();
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
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
      status     TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at   TEXT
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
  `);
}
