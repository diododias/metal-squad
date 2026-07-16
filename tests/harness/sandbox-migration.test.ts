import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('sandbox db migration', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    vi.resetModules();
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-harness-db-'));
    process.env['MSQ_DB_PATH'] = join(directory, 'app.db');
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) delete process.env['MSQ_DB_PATH'];
    else process.env['MSQ_DB_PATH'] = previousDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates a fresh valid database at the sandbox path', async () => {
    const dbModule = await import('../../src/db/index.js');
    resetDb = dbModule.resetDb;

    const db = dbModule.getDb('readwrite');
    expect(db.prepare('SELECT 1 AS ok').get()).toEqual({ ok: 1 });

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    expect(tables.length).toBeGreaterThan(0);
    expect(existsSync(join(directory, 'app.db'))).toBe(true);
  });
});
