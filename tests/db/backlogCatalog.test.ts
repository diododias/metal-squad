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

  describe('updateCatalogFeature', () => {
    it('persists a patch to data_json and denormalized columns', async () => {
      const { db, upsertBacklogCatalog, updateCatalogFeature } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');

      const updated = updateCatalogFeature('repo-1', 'feat-1', { effort: 'high', maxTokens: 5000 });
      expect(updated.effort).toBe('high');
      expect(updated.maxTokens).toBe(5000);

      const row = db
        .prepare(`SELECT data_json FROM backlog_features WHERE feature_id = 'feat-1'`)
        .get() as { data_json: string };
      const stored = JSON.parse(row.data_json) as { effort: string; maxTokens: number };
      expect(stored.effort).toBe('high');
      expect(stored.maxTokens).toBe(5000);
    });

    it('round-trips maxTokens through loadBacklogFromCatalog', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      const { loadBacklogFromCatalog } = await import('../../src/core/backlog/load.js');
      upsertBacklogCatalog(makeBacklog(), 'repo-1');

      updateCatalogFeature('repo-1', 'feat-1', { maxTokens: 12345 });
      const reloaded = loadBacklogFromCatalog('repo-1');
      expect(reloaded.epics[0]?.features[0]?.maxTokens).toBe(12345);
    });

    it('deep-merges workflow so patching only stages preserves approvals', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');

      const updated = updateCatalogFeature('repo-1', 'feat-1', {
        workflow: { stages: ['plan', 'implement'] },
      });
      expect(updated.workflow.stages).toEqual(['plan', 'implement']);
      expect(updated.workflow.approvals).toEqual({ channel: 'telegram', autoAdvance: false });
      expect(updated.workflow.syncTasksToBacklog).toBe(true);
    });

    it('deep-merges workflow.approvals so patching only autoAdvance preserves channel', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');

      const updated = updateCatalogFeature('repo-1', 'feat-1', {
        workflow: { approvals: { autoAdvance: true } },
      });
      expect(updated.workflow.approvals).toEqual({ channel: 'telegram', autoAdvance: true });
      expect(updated.workflow.stages).toEqual(['specify', 'plan', 'tasks', 'implement', 'validate']);
    });

    it('throws on an invalid patch and writes nothing', async () => {
      const { db, upsertBacklogCatalog, updateCatalogFeature } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');
      const before = db
        .prepare(`SELECT data_json, updated_at FROM backlog_features WHERE feature_id = 'feat-1'`)
        .get() as { data_json: string; updated_at: string };

      expect(() => updateCatalogFeature('repo-1', 'feat-1', { maxTokens: -1 })).toThrow();

      const after = db
        .prepare(`SELECT data_json, updated_at FROM backlog_features WHERE feature_id = 'feat-1'`)
        .get() as { data_json: string; updated_at: string };
      expect(after).toEqual(before);
    });

    it('throws BacklogCatalogNotFoundError for an unknown feature', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');
      expect(() => updateCatalogFeature('repo-1', 'nope', { effort: 'high' })).toThrow(/not found/);
    });

    it('throws BacklogCatalogNotFoundError for an archived feature', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');
      upsertBacklogCatalog(makeBacklog({ epics: [{ id: 'epic-1', title: 'Epic One', features: [] }] }), 'repo-1');
      expect(() => updateCatalogFeature('repo-1', 'feat-1', { effort: 'high' })).toThrow(/not found/);
    });
  });

  describe('updateCatalogTask', () => {
    it('persists a patch to data_json and keeps title/status columns in sync', async () => {
      const { db, upsertBacklogCatalog, updateCatalogTask } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');

      const updated = updateCatalogTask('feat-1', 'task-1', { status: 'done', title: 'Renamed Task' });
      expect(updated.status).toBe('done');
      expect(updated.title).toBe('Renamed Task');

      const row = db
        .prepare(`SELECT title, status, data_json FROM backlog_tasks WHERE task_id = 'task-1'`)
        .get() as { title: string; status: string; data_json: string };
      expect(row.title).toBe('Renamed Task');
      expect(row.status).toBe('done');
      expect((JSON.parse(row.data_json) as { status: string }).status).toBe('done');
    });

    it('throws on an invalid patch and writes nothing', async () => {
      const { db, upsertBacklogCatalog, updateCatalogTask } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');
      const before = db
        .prepare(`SELECT data_json, updated_at FROM backlog_tasks WHERE task_id = 'task-1'`)
        .get() as { data_json: string; updated_at: string };

      expect(() => updateCatalogTask('feat-1', 'task-1', { status: 'not-a-status' as never })).toThrow();

      const after = db
        .prepare(`SELECT data_json, updated_at FROM backlog_tasks WHERE task_id = 'task-1'`)
        .get() as { data_json: string; updated_at: string };
      expect(after).toEqual(before);
    });

    it('throws BacklogCatalogNotFoundError for an unknown task', async () => {
      const { upsertBacklogCatalog, updateCatalogTask } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');
      expect(() => updateCatalogTask('feat-1', 'nope', { status: 'done' })).toThrow(/not found/);
    });

    it('keeps the owning feature\'s embedded tasks[] in sync, so loadBacklogFromCatalog sees the patch', async () => {
      const { upsertBacklogCatalog, updateCatalogTask } = await setup();
      const { loadBacklogFromCatalog } = await import('../../src/core/backlog/load.js');
      upsertBacklogCatalog(makeBacklog(), 'repo-1');

      updateCatalogTask('feat-1', 'task-1', { status: 'done', title: 'Renamed Task' });

      const reloaded = loadBacklogFromCatalog('repo-1');
      const task = reloaded.epics[0]?.features[0]?.tasks[0];
      expect(task).toMatchObject({ id: 'task-1', title: 'Renamed Task', status: 'done' });
    });
  });
});
