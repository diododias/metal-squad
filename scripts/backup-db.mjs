import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const dbPath = process.env.MSQ_DB_PATH ?? join(homedir(), '.local', 'share', 'metal-squad', 'app.db');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join(homedir(), '.config', 'metal-squad', 'backup', timestamp);
const backupPath = join(backupDir, 'app.db');

if (!existsSync(dbPath)) {
  throw new Error(`SQLite database not found at ${dbPath}`);
}

mkdirSync(backupDir, { recursive: true });

const source = new Database(dbPath, { readonly: true, fileMustExist: true });

try {
  await source.backup(backupPath);
} finally {
  source.close();
}

const backup = new Database(backupPath, { readonly: true, fileMustExist: true });

try {
  const integrity = backup.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') {
    throw new Error(`Backup integrity check failed: ${integrity}`);
  }
} finally {
  backup.close();
}

console.log(`SQLite backup created at ${backupPath}`);
