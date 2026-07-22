import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('SQLite backup/restore (PRJ-20)', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-db-backup-'));
    process.env['MSQ_DB_PATH'] = join(directory, 'app.db');
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) delete process.env['MSQ_DB_PATH'];
    else process.env['MSQ_DB_PATH'] = previousDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  async function setup() {
    const dbModule = await import('../../src/db/index.js');
    resetDb = dbModule.resetDb;
    const repo = await import('../../src/db/repo.js');
    const backup = await import('../../src/db/backup.js');
    return { db: dbModule.getDb('readwrite'), ...repo, ...backup };
  }

  it('backs up a live WAL database and the copy passes integrity checks', async () => {
    const { db, createProject, backupDb } = await setup();
    createProject({ name: 'Alpha' });
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');

    const destPath = join(directory, 'backup', 'app.db');
    await backupDb(destPath);

    expect(existsSync(destPath)).toBe(true);
    const Database = (await import('better-sqlite3')).default;
    const copy = new Database(destPath, { readonly: true, fileMustExist: true });
    try {
      const projects = copy.prepare('SELECT name FROM projects').all() as { name: string }[];
      expect(projects.map((p) => p.name)).toEqual(['Alpha']);
    } finally {
      copy.close();
    }
  });

  it('throws when the source database does not exist', async () => {
    const { backupDb } = await setup();
    resetDb();
    rmSync(process.env['MSQ_DB_PATH']!, { force: true });
    await expect(backupDb(join(directory, 'out.db'))).rejects.toThrow(/not found/);
  });

  it('restores a backup, replacing the live database and preserving a safety copy of the previous one', async () => {
    const { createProject, backupDb, restoreDb, listProjects } = await setup();
    createProject({ name: 'Before restore' });
    const backupPath = join(directory, 'backup.db');
    await backupDb(backupPath);

    createProject({ name: 'Overwritten by restore' });

    const result = await restoreDb(backupPath);
    expect(result.destinationBackupPath).toBeTruthy();
    expect(existsSync(result.destinationBackupPath)).toBe(true);

    const projects = listProjects();
    expect(projects.map((p) => p.name)).toEqual(['Before restore']);
  });

  it('refuses to restore a corrupted source file', async () => {
    const { restoreDb } = await setup();
    const corruptPath = join(directory, 'corrupt.db');
    writeFileSync(corruptPath, 'not a real sqlite file');
    await expect(restoreDb(corruptPath)).rejects.toThrow();
  });
});
