import { existsSync, renameSync, rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import { resolveDbPath, ensureDataDir } from '../config/index.js';
import { assertWritableDbPath, resetDb } from './index.js';

export class DbIntegrityError extends Error {
  public constructor(public readonly dbPath: string, detail: string) {
    super(`SQLite integrity check failed at ${dbPath}: ${detail}`);
    this.name = 'DbIntegrityError';
  }
}

function verifyIntegrity(dbPath: string): void {
  const check = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const integrity = check.pragma('integrity_check', { simple: true }) as string;
    if (integrity !== 'ok') throw new DbIntegrityError(dbPath, `integrity_check reported "${integrity}"`);
    const fkViolations = check.pragma('foreign_key_check') as unknown[];
    if (fkViolations.length > 0) {
      throw new DbIntegrityError(dbPath, `foreign_key_check found ${String(fkViolations.length)} violation(s)`);
    }
  } finally {
    check.close();
  }
}

/**
 * Creates a WAL-safe, integrity-verified copy of the source database at
 * `destPath`, using better-sqlite3's online backup API rather than a raw file
 * copy (which can capture a torn write while WAL checkpointing is active).
 */
export async function backupDb(destPath: string, sourcePath = resolveDbPath()): Promise<void> {
  if (!existsSync(sourcePath)) throw new Error(`SQLite database not found at ${sourcePath}`);
  ensureDataDir(destPath);
  if (existsSync(destPath)) rmSync(destPath);

  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destPath);
  } finally {
    source.close();
  }
  verifyIntegrity(destPath);
}

export interface RestoreDbResult {
  destinationBackupPath: string;
}

/**
 * Replaces the live database at `destPath` with `sourcePath`, after verifying
 * the incoming file's integrity and taking a safety backup of whatever is
 * currently at `destPath`. Callers own confirmation prompts; this function
 * performs no interactive checks itself.
 */
export async function restoreDb(sourcePath: string, destPath = resolveDbPath()): Promise<RestoreDbResult> {
  if (!existsSync(sourcePath)) throw new Error(`Restore source not found at ${sourcePath}`);
  verifyIntegrity(sourcePath);
  assertWritableDbPath(destPath);

  resetDb();

  const destinationBackupPath = `${destPath}.pre-restore-${String(Date.now())}.bak`;
  if (existsSync(destPath)) renameSync(destPath, destinationBackupPath);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${destPath}${suffix}`;
    if (existsSync(sidecar)) rmSync(sidecar);
  }

  try {
    const restored = new Database(sourcePath, { readonly: true, fileMustExist: true });
    try {
      await restored.backup(destPath);
    } finally {
      restored.close();
    }
    verifyIntegrity(destPath);
  } catch (error) {
    rmSync(destPath, { force: true });
    if (existsSync(destinationBackupPath)) renameSync(destinationBackupPath, destPath);
    throw error;
  }

  return { destinationBackupPath: existsSync(destinationBackupPath) ? destinationBackupPath : '' };
}
