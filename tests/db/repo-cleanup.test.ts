import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('cleanupStaleRuns', () => {
  const previousHome = process.env.HOME;
  const previousMsqDbPath = process.env['MSQ_DB_PATH'];
  let home = '';

  afterEach(async () => {
    if (home) rmSync(home, { recursive: true, force: true });
    process.env.HOME = previousHome;
    if (previousMsqDbPath === undefined) {
      delete process.env['MSQ_DB_PATH'];
    } else {
      process.env['MSQ_DB_PATH'] = previousMsqDbPath;
    }
    home = '';
    await import('../../src/db/index.js').then(({ resetDb }) => {
      resetDb();
    }).catch(() => {});
  });

  it('marks old running rows as failed and keeps fresh runs untouched', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-db-cleanup-'));
    process.env.HOME = home;
    delete process.env['MSQ_DB_PATH'];

    const { getDb } = await import('../../src/db/index.js');
    const { cleanupStaleRuns } = await import('../../src/db/repo.js');
    const db = getDb();

    db.prepare(
      `INSERT INTO repos (repo_id, path) VALUES ('repo-1', '/tmp/repo-1')`,
    ).run();
    db.prepare(
      `INSERT INTO runs (repo_id, feature_id, tool, status, started_at)
       VALUES ('repo-1', 'feat-stale', 'codex', 'running', datetime('now', '-300 minutes'))`,
    ).run();
    db.prepare(
      `INSERT INTO runs (repo_id, feature_id, tool, status, started_at)
       VALUES ('repo-1', 'feat-fresh', 'codex', 'running', datetime('now', '-5 minutes'))`,
    ).run();

    const changed = cleanupStaleRuns(120);
    expect(changed).toBe(1);

    const rows = db.prepare(
      `SELECT feature_id, status, ended_at FROM runs ORDER BY id`,
    ).all() as Array<{ feature_id: string; status: string; ended_at: string | null }>;

    expect(rows[0]).toMatchObject({ feature_id: 'feat-stale', status: 'failed' });
    expect(rows[0]?.ended_at).toBeTruthy();
    expect(rows[1]).toMatchObject({ feature_id: 'feat-fresh', status: 'running' });
    const { resetDb } = await import('../../src/db/index.js');
    resetDb();
  });
});
