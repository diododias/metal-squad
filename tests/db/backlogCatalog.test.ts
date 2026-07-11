import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { BacklogV2 } from '../../src/core/backlog/schema.js';

function makeBacklog(overrides: Partial<BacklogV2> = {}): BacklogV2 {
  return {
    version: 2,
    repo: 'demo',
    defaults: { tool: 'claude', effort: 'medium', skills: [], stageSkills: {} },
    epics: [
      {
        id: 'epic-1',
        title: 'Epic One',
        features: [
          {
            id: 'feat-1',
            title: 'Feature One',
            tool: 'claude',
            effort: 'medium',
            dependsOn: [],
            tasks: [
              { id: 'task-1', title: 'Task One', status: 'todo', dependsOn: [] },
            ],
            workflow: {
              mode: 'staged',
              stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
              approvals: { channel: 'telegram', autoAdvance: false },
              syncTasksToBacklog: true,
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('backlogCatalog upsert/diff/load', () => {
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
    await import('../../src/db/index.js').then(({ resetDb }) => resetDb()).catch(() => {});
  });

  async function setup() {
    home = mkdtempSync(join(tmpdir(), 'msq-backlog-catalog-'));
    process.env.HOME = home;
    delete process.env['MSQ_DB_PATH'];

    const { getDb } = await import('../../src/db/index.js');
    const repo = await import('../../src/db/backlogCatalog.js');
    const { registerRepo } = await import('../../src/db/repo.js');
    const db = getDb();
    registerRepo('repo-1', '/tmp/repo-1');
    return { db, ...repo };
  }

  it('loads a fresh catalog end-to-end after upsert', async () => {
    const { upsertBacklogCatalog } = await setup();
    const { loadBacklogFromCatalog } = await import('../../src/core/backlog/load.js');
    const backlog = makeBacklog();

    const diff = upsertBacklogCatalog(backlog, 'repo-1');
    expect(diff.addedFeatures).toEqual(['feat-1']);
    expect(diff.changedFeatures).toEqual([]);
    expect(diff.archivedFeatures).toEqual([]);

    const reloaded = loadBacklogFromCatalog('repo-1');
    expect(reloaded.epics).toHaveLength(1);
    expect(reloaded.epics[0]?.features[0]).toMatchObject({ id: 'feat-1', title: 'Feature One' });
    expect(reloaded.epics[0]?.features[0]?.tasks).toEqual([
      { id: 'task-1', title: 'Task One', status: 'todo', dependsOn: [] },
    ]);
  });

  it('is a true no-op the second time the same backlog is loaded', async () => {
    const { db, upsertBacklogCatalog } = await setup();
    const backlog = makeBacklog();

    upsertBacklogCatalog(backlog, 'repo-1');
    const before = db
      .prepare(`SELECT updated_at FROM backlog_features WHERE feature_id = 'feat-1'`)
      .get() as { updated_at: string };

    const diff = upsertBacklogCatalog(backlog, 'repo-1');
    expect(diff.addedFeatures).toEqual([]);
    expect(diff.changedFeatures).toEqual([]);
    expect(diff.unchangedFeatures).toEqual(['feat-1']);

    const after = db
      .prepare(`SELECT updated_at FROM backlog_features WHERE feature_id = 'feat-1'`)
      .get() as { updated_at: string };
    expect(after.updated_at).toBe(before.updated_at);
  });

  it('archives a feature removed from the YAML instead of deleting it', async () => {
    const { db, upsertBacklogCatalog } = await setup();
    upsertBacklogCatalog(makeBacklog(), 'repo-1');

    const shrunk = makeBacklog({ epics: [{ id: 'epic-1', title: 'Epic One', features: [] }] });
    const diff = upsertBacklogCatalog(shrunk, 'repo-1');
    expect(diff.archivedFeatures).toEqual(['feat-1']);

    const row = db
      .prepare(`SELECT feature_id, archived_at FROM backlog_features WHERE feature_id = 'feat-1'`)
      .get() as { feature_id: string; archived_at: string | null };
    expect(row.feature_id).toBe('feat-1');
    expect(row.archived_at).toBeTruthy();
  });

  it('never writes to run/gate/token/pipeline tables', async () => {
    const { db, upsertBacklogCatalog } = await setup();
    db.prepare(
      `INSERT INTO runs (repo_id, feature_id, tool, status, started_at) VALUES ('repo-1', 'feat-1', 'claude', 'done', datetime('now'))`,
    ).run();

    const countsBefore = {
      runs: (db.prepare('SELECT COUNT(*) AS n FROM runs').get() as { n: number }).n,
      gates: (db.prepare('SELECT COUNT(*) AS n FROM gates').get() as { n: number }).n,
      pipelines: (db.prepare('SELECT COUNT(*) AS n FROM pipelines').get() as { n: number }).n,
    };

    upsertBacklogCatalog(makeBacklog({ epics: [] }), 'repo-1');

    const countsAfter = {
      runs: (db.prepare('SELECT COUNT(*) AS n FROM runs').get() as { n: number }).n,
      gates: (db.prepare('SELECT COUNT(*) AS n FROM gates').get() as { n: number }).n,
      pipelines: (db.prepare('SELECT COUNT(*) AS n FROM pipelines').get() as { n: number }).n,
    };
    expect(countsAfter).toEqual(countsBefore);
  });

  it('throws an actionable error when no catalog was ever loaded', async () => {
    await setup();
    const { loadBacklogFromCatalog } = await import('../../src/core/backlog/load.js');
    expect(() => loadBacklogFromCatalog('repo-1')).toThrow('msq backlog load');
  });
});
