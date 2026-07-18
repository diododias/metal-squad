import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { BacklogV2 } from '../../src/core/backlog/schema.js';

function makeBacklog(overrides: Partial<BacklogV2> = {}): BacklogV2 {
  return {
    version: 2,
    repo: 'demo',
    defaults: {
      tool: 'claude',
      effort: 'medium',
      thinking: 'off',
      skills: [],
      stageSkills: {},
      workflow: {
        mode: 'staged',
        stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
        approvals: { channel: 'telegram', autoAdvance: false },
        syncTasksToBacklog: true,
        sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
        stepGuidance: {},
      },
    },
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
              sessionPolicy: {
                mode: 'isolated',
                alwaysIsolatedStages: [],
              },
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
    await import('../../src/db/index.js').then(({ resetDb }) => resetDb()).catch(() => {});
    if (home) rmSync(home, { recursive: true, force: true });
    process.env.HOME = previousHome;
    if (previousMsqDbPath === undefined) {
      delete process.env['MSQ_DB_PATH'];
    } else {
      process.env['MSQ_DB_PATH'] = previousMsqDbPath;
    }
    home = '';
  });

  async function setup(options: { migrated?: boolean } = {}) {
    home = mkdtempSync(join(tmpdir(), 'msq-backlog-catalog-'));
    process.env.HOME = home;
    process.env['MSQ_DB_PATH'] = join(home, 'app.db');

    const { getDb } = await import('../../src/db/index.js');
    const repo = await import('../../src/db/backlogCatalog.js');
    const { registerRepo } = await import('../../src/db/repo.js');
    const db = getDb();
    registerRepo('repo-1', '/tmp/repo-1');
    if (options.migrated) {
      const { backfillProjects } = await import('../../src/db/backfill.js');
      backfillProjects(db);
    }
    return { db, ...repo };
  }

  describe('non-destructive seed plan', () => {
    it('creates missing rows, then reports the same input as unchanged without overwriting', async () => {
      const { db, planBacklogSeed, applyBacklogSeed } = await setup({ migrated: true });
      const backlog = makeBacklog();

      const first = planBacklogSeed(backlog, 'repo-1');
      expect(first.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'catalog', status: 'created' }),
        expect.objectContaining({ kind: 'epic', id: 'epic-1', status: 'created' }),
        expect.objectContaining({ kind: 'feature', id: 'feat-1', status: 'created' }),
        expect.objectContaining({ kind: 'task', id: 'feat-1/task-1', status: 'created' }),
      ]));
      applyBacklogSeed(backlog, first);

      const second = planBacklogSeed(backlog, 'repo-1');
      expect(second.items.filter((item) => item.kind !== 'catalog').every((item) => item.status === 'unchanged')).toBe(true);
      const before = db.prepare(`SELECT data_json FROM backlog_features WHERE feature_id = 'feat-1'`).get();
      applyBacklogSeed(backlog, second);
      expect(db.prepare(`SELECT data_json FROM backlog_features WHERE feature_id = 'feat-1'`).get()).toEqual(before);
    });

    it('reports a field-level conflict and leaves the managed feature untouched', async () => {
      const { db, planBacklogSeed, applyBacklogSeed } = await setup({ migrated: true });
      const original = makeBacklog();
      applyBacklogSeed(original, planBacklogSeed(original, 'repo-1'));
      const changed = makeBacklog({ epics: [{
        ...original.epics[0]!,
        features: [{ ...original.epics[0]!.features[0]!, title: 'Edited in YAML' }],
      }] });

      const plan = planBacklogSeed(changed, 'repo-1');
      expect(plan.items).toContainEqual(expect.objectContaining({
        kind: 'feature', id: 'feat-1', status: 'conflict',
        conflict: expect.objectContaining({ path: '$.title', databaseValue: 'Feature One', importedValue: 'Edited in YAML' }),
      }));
      applyBacklogSeed(changed, plan);
      expect(db.prepare(`SELECT title FROM backlog_features WHERE feature_id = 'feat-1'`).get()).toEqual({ title: 'Feature One' });
    });

    it('keeps DB-only rows when the seed YAML is empty and rejects cross-repo dependencies', async () => {
      const { db, planBacklogSeed, applyBacklogSeed } = await setup({ migrated: true });
      const original = makeBacklog();
      applyBacklogSeed(original, planBacklogSeed(original, 'repo-1'));
      const empty = makeBacklog({ epics: [] });
      applyBacklogSeed(empty, planBacklogSeed(empty, 'repo-1'));
      expect(db.prepare(`SELECT archived_at FROM backlog_features WHERE feature_id = 'feat-1'`).get()).toEqual({ archived_at: null });

      const { registerRepo } = await import('../../src/db/repo.js');
      registerRepo('repo-2', '/tmp/repo-2');
      const crossRepo = makeBacklog({ epics: [{
        id: 'epic-2', title: 'Epic Two', features: [{
          ...original.epics[0]!.features[0]!, id: 'feat-2', dependsOn: ['feat-1'], tasks: [],
        }],
      }] });
      const plan = planBacklogSeed(crossRepo, 'repo-2');
      expect(plan.items).toContainEqual(expect.objectContaining({
        kind: 'feature', id: 'feat-2', status: 'invalid', reason: expect.stringContaining('another repository'),
      }));
    });
  });

  it('loads a fresh catalog end-to-end after upsert', async () => {
    const { db, upsertBacklogCatalog } = await setup();
    const { loadBacklogFromCatalog } = await import('../../src/core/backlog/load.js');
    const backlog = makeBacklog();

    const diff = upsertBacklogCatalog(backlog, 'repo-1');
    expect(diff.addedFeatures).toEqual(['feat-1']);
    expect(diff.changedFeatures).toEqual([]);
    expect(diff.archivedFeatures).toEqual([]);
    expect(db.prepare(`SELECT epic_id FROM backlog_epics WHERE epic_id = 'epic-1'`).get()).toEqual({ epic_id: 'epic-1' });

    const reloaded = loadBacklogFromCatalog('repo-1');
    expect(reloaded.epics).toHaveLength(1);
    expect(reloaded.epics[0]?.features[0]).toMatchObject({ id: 'feat-1', title: 'Feature One' });
    expect(reloaded.epics[0]?.features[0]?.tasks).toEqual([
      { id: 'task-1', title: 'Task One', status: 'todo', dependsOn: [], skills: [] },
    ]);
  });

  it('writes NULL to the legacy Epic repo_id after the project backfill', async () => {
    const { db, upsertBacklogCatalog } = await setup({ migrated: true });

    upsertBacklogCatalog(makeBacklog(), 'repo-1');

    expect(db.prepare(`SELECT project_id, repo_id FROM backlog_epics WHERE epic_id = 'epic-1'`).get()).toMatchObject({
      project_id: expect.any(String),
      repo_id: null,
    });
  });

  it('rekeys catalog rows and runtime references to the generated ID', async () => {
    const { db, upsertBacklogCatalog } = await setup();
    const { registerBacklogFeatures } = await import('../../src/core/backlog/featureId.js');
    const original = makeBacklog();
    upsertBacklogCatalog(original, 'repo-1');
    const run = db.prepare(
      `INSERT INTO runs (repo_id, feature_id, tool, status, started_at) VALUES ('repo-1', 'feat-1', 'claude', 'done', datetime('now'))`,
    ).run();

    const registration = registerBacklogFeatures(original, new Set(['feat-1']), () => 0);
    const generatedId = registration.backlog.epics[0]!.features[0]!.id;
    upsertBacklogCatalog(registration.backlog, 'repo-1', registration.registrations);

    expect(db.prepare(`SELECT feature_id FROM backlog_features WHERE feature_id = 'feat-1'`).get()).toBeUndefined();
    expect(db.prepare(`SELECT feature_id FROM backlog_tasks WHERE task_id = 'task-1'`).get()).toEqual({ feature_id: generatedId });
    expect(db.prepare(`SELECT feature_id FROM runs WHERE id = ?`).get(run.lastInsertRowid)).toEqual({ feature_id: generatedId });
    expect(db.prepare(`SELECT feature_id FROM backlog_features WHERE feature_id = ?`).get(generatedId)).toEqual({ feature_id: generatedId });
  });

  it('migrates remaining database rows when the authoritative loader runs', async () => {
    const { db, upsertBacklogCatalog } = await setup();
    upsertBacklogCatalog(makeBacklog(), 'repo-1');

    upsertBacklogCatalog(makeBacklog({ epics: [] }), 'repo-1', []);

    const row = db.prepare(`SELECT feature_id, data_json FROM backlog_features WHERE repo_id = 'repo-1'`).get() as {
      feature_id: string;
      data_json: string;
    };
    expect(row.feature_id).toMatch(/^F-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    expect(JSON.parse(row.data_json)).toMatchObject({ id: row.feature_id });
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

  it('retains a feature after it is consumed from the YAML queue', async () => {
    const { db, upsertBacklogCatalog } = await setup();
    upsertBacklogCatalog(makeBacklog(), 'repo-1');

    const shrunk = makeBacklog({ epics: [{ id: 'epic-1', title: 'Epic One', features: [] }] });
    const diff = upsertBacklogCatalog(shrunk, 'repo-1');
    expect(diff.archivedFeatures).toEqual([]);

    const row = db
      .prepare(`SELECT feature_id, archived_at FROM backlog_features WHERE feature_id = 'feat-1'`)
      .get() as { feature_id: string; archived_at: string | null };
    expect(row.feature_id).toBe('feat-1');
    expect(row.archived_at).toBeNull();
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

  it('rejects an explicit feature ID owned by another repository and rolls back', async () => {
    const { db, upsertBacklogCatalog } = await setup();
    const { registerRepo } = await import('../../src/db/repo.js');
    registerRepo('repo-2', '/tmp/repo-2');
    upsertBacklogCatalog(makeBacklog(), 'repo-1');

    expect(() => upsertBacklogCatalog(makeBacklog({ repo: 'other' }), 'repo-2'))
      .toThrow('already owned by repository "repo-1"');
    const row = db
      .prepare(`SELECT repo_id, title FROM backlog_features WHERE feature_id = 'feat-1'`)
      .get() as { repo_id: string; title: string };
    expect(row).toEqual({ repo_id: 'repo-1', title: 'Feature One' });
  });

  it('keeps archived IDs occupied so a later allocation cannot reuse them', async () => {
    const { upsertBacklogCatalog } = await setup();
    const { listOccupiedFeatureIds } = await import('../../src/db/backlogCatalog.js');
    upsertBacklogCatalog(makeBacklog(), 'repo-1');
    upsertBacklogCatalog(makeBacklog({ epics: [{ id: 'epic-1', title: 'Epic One', features: [] }] }), 'repo-1');
    expect(listOccupiedFeatureIds()).toContain('feat-1');
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

    it('preserves every other execution field when patching one execution value', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      const backlog = makeBacklog({
        epics: [{
          id: 'epic-1',
          title: 'Epic One',
          features: [{
            ...makeBacklog().epics[0]!.features[0]!,
            tool: 'codex',
            model: 'gpt-5.6',
            effort: 'low',
            maxTokens: 4000,
            autoStart: true,
          }],
        }],
      });
      upsertBacklogCatalog(backlog, 'repo-1');

      const updated = updateCatalogFeature('repo-1', 'feat-1', { effort: 'high' });
      expect(updated).toMatchObject({
        tool: 'codex',
        model: 'gpt-5.6',
        effort: 'high',
        maxTokens: 4000,
        autoStart: true,
      });
    });

    it('deep-merges a stages-only reorder while preserving the project autoAdvance value', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');

      const updated = updateCatalogFeature('repo-1', 'feat-1', {
        workflow: { stages: ['plan', 'specify', 'tasks', 'implement', 'validate'] },
      });
      expect(updated.workflow.stages).toEqual(['plan', 'specify', 'tasks', 'implement', 'validate']);
      expect(updated.workflow.approvals).toEqual({ channel: 'telegram' });
      expect(updated.workflow.autoAdvance).toBe(false);
      expect(updated.workflow.syncTasksToBacklog).toBe(true);
    });

    it('persists a complete reordered stages array without changing guidance or isolation', async () => {
      const { db, upsertBacklogCatalog, updateCatalogFeature } = await setup();
      const workflow = {
        mode: 'staged' as const,
        stages: ['specify', 'plan', 'implement'],
        approvals: { channel: 'telegram' as const },
        autoAdvance: false,
        syncTasksToBacklog: true,
        sessionPolicy: { mode: 'isolated' as const, alwaysIsolatedStages: ['plan'] },
        stepGuidance: { plan: { skills: ['planner'], prompt: 'Plan carefully.' } },
      };
      upsertBacklogCatalog(makeBacklog({ epics: [{ id: 'epic-1', title: 'Epic One', features: [{ ...makeBacklog().epics[0]!.features[0]!, workflow }] }] }), 'repo-1');

      const updated = updateCatalogFeature('repo-1', 'feat-1', {
        workflow: { stages: ['plan', 'specify', 'implement'] },
      });
      const stored = JSON.parse((db.prepare(`SELECT data_json FROM backlog_features WHERE feature_id = 'feat-1'`).get() as { data_json: string }).data_json) as { workflow: typeof workflow };

      expect(updated.workflow.stages).toEqual(['plan', 'specify', 'implement']);
      expect(updated.workflow.stepGuidance).toEqual(workflow.stepGuidance);
      expect(updated.workflow.sessionPolicy).toEqual(workflow.sessionPolicy);
      expect(stored.workflow).toEqual(updated.workflow);
    });

    it('updates workflow.autoAdvance without changing the approval channel', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');

      const updated = updateCatalogFeature('repo-1', 'feat-1', {
        workflow: { autoAdvance: true },
      });
      expect(updated.workflow.approvals).toEqual({ channel: 'telegram' });
      expect(updated.workflow.autoAdvance).toBe(true);
      expect(updated.workflow.stages).toEqual(['specify', 'plan', 'tasks', 'implement', 'validate']);
    });

    it('deep-merges each sparse editable workflow patch without changing siblings', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      const workflow = {
        mode: 'staged' as const,
        stages: ['specify', 'plan'],
        approvals: { channel: 'telegram' as const },
        autoAdvance: false,
        syncTasksToBacklog: true,
        sessionPolicy: { mode: 'isolated' as const, alwaysIsolatedStages: ['specify'] },
        stepGuidance: { specify: { prompt: 'Keep this guidance.' } },
        stagePublishes: {},
      };
      upsertBacklogCatalog(makeBacklog({ epics: [{ id: 'epic-1', title: 'Epic One', features: [{ ...makeBacklog().epics[0]!.features[0]!, workflow }] }] }), 'repo-1');

      const updated = updateCatalogFeature('repo-1', 'feat-1', { workflow: { mode: 'single' } });
      expect(updated.workflow).toEqual({ ...workflow, mode: 'single' });
      expect(updated.title).toBe('Feature One');
      expect(updated.effort).toBe('medium');
    });

    it('deep-merges workflow.sessionPolicy so patching only mode preserves alwaysIsolatedStages', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      upsertBacklogCatalog(makeBacklog({
        epics: [{
          id: 'epic-1',
          title: 'Epic One',
          features: [{
            ...makeBacklog().epics[0]!.features[0]!,
            workflow: {
              mode: 'staged',
              stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
              approvals: { channel: 'telegram', autoAdvance: false },
              syncTasksToBacklog: true,
              sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: ['specify'] },
            },
          }],
        }],
      }), 'repo-1');

      const updated = updateCatalogFeature('repo-1', 'feat-1', {
        workflow: { sessionPolicy: { mode: 'adaptive' } },
      });
      expect(updated.workflow.sessionPolicy).toEqual({
        mode: 'adaptive',
        alwaysIsolatedStages: ['specify'],
      });
    });

    it('persists one valid removal patch that clears only the removed stage references', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      const workflow = {
        mode: 'staged' as const,
        stages: ['specify', 'implement', 'validate'],
        approvals: { channel: 'telegram' as const, autoAdvance: false },
        syncTasksToBacklog: true,
        sessionPolicy: { mode: 'isolated' as const, alwaysIsolatedStages: ['implement', 'validate'] },
        stepGuidance: {
          specify: { prompt: 'Keep this.' },
          implement: { prompt: 'Remove this.' },
          validate: { prompt: 'Keep this too.' },
        },
      };
      upsertBacklogCatalog(makeBacklog({ epics: [{ id: 'epic-1', title: 'Epic One', features: [{ ...makeBacklog().epics[0]!.features[0]!, workflow }] }] }), 'repo-1');

      const updated = updateCatalogFeature('repo-1', 'feat-1', {
        workflow: {
          stages: ['specify', 'validate'],
          stepGuidance: { specify: { prompt: 'Keep this.' }, validate: { prompt: 'Keep this too.' } },
          sessionPolicy: { alwaysIsolatedStages: ['validate'] },
        },
      });

      expect(updated.workflow.stages).toEqual(['specify', 'validate']);
      expect(updated.workflow.stepGuidance).toEqual({ specify: { prompt: 'Keep this.' }, validate: { prompt: 'Keep this too.' } });
      expect(updated.workflow.sessionPolicy).toEqual({ mode: 'isolated', alwaysIsolatedStages: ['validate'] });
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

    it('rejects an invalid merged workflow atomically', async () => {
      const { db, upsertBacklogCatalog, updateCatalogFeature } = await setup();
      const workflow = {
        mode: 'staged' as const,
        stages: ['specify', 'plan'],
        approvals: { channel: 'telegram' as const, autoAdvance: false },
        syncTasksToBacklog: true,
        sessionPolicy: { mode: 'isolated' as const, alwaysIsolatedStages: ['specify'] },
      };
      upsertBacklogCatalog(makeBacklog({ epics: [{ id: 'epic-1', title: 'Epic One', features: [{ ...makeBacklog().epics[0]!.features[0]!, workflow }] }] }), 'repo-1');
      const before = db.prepare(`SELECT data_json, updated_at FROM backlog_features WHERE feature_id = 'feat-1'`).get();

      expect(() => updateCatalogFeature('repo-1', 'feat-1', { workflow: { stages: ['plan'] } })).toThrow(/permutation/);

      expect(db.prepare(`SELECT data_json, updated_at FROM backlog_features WHERE feature_id = 'feat-1'`).get()).toEqual(before);
    });

    it('rejects a non-permutation stages-only reorder without changing the catalog revision', async () => {
      const { db, upsertBacklogCatalog, updateCatalogFeature } = await setup();
      const workflow = {
        mode: 'staged' as const,
        stages: ['specify', 'plan', 'implement'],
        approvals: { channel: 'telegram' as const, autoAdvance: false },
        syncTasksToBacklog: true,
        sessionPolicy: { mode: 'isolated' as const, alwaysIsolatedStages: [] },
      };
      upsertBacklogCatalog(makeBacklog({ epics: [{ id: 'epic-1', title: 'Epic One', features: [{ ...makeBacklog().epics[0]!.features[0]!, workflow }] }] }), 'repo-1');
      const before = db.prepare(`SELECT data_json FROM backlog_features WHERE feature_id = 'feat-1'`).get();

      expect(() => updateCatalogFeature('repo-1', 'feat-1', { workflow: { stages: ['plan', 'specify', 'plan'] } })).toThrow(/permutation/);

      expect(db.prepare(`SELECT data_json FROM backlog_features WHERE feature_id = 'feat-1'`).get()).toEqual(before);
    });

    it('rejects unsupported tools atomically', async () => {
      const { db, upsertBacklogCatalog, updateCatalogFeature } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');
      const before = db.prepare(`SELECT data_json FROM backlog_features WHERE feature_id = 'feat-1'`).get();

      expect(() => updateCatalogFeature('repo-1', 'feat-1', { tool: 'legacy-tool' as never })).toThrow();

      const after = db.prepare(`SELECT data_json FROM backlog_features WHERE feature_id = 'feat-1'`).get();
      expect(after).toEqual(before);
    });

    it('throws BacklogCatalogNotFoundError for an unknown feature', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');
      expect(() => updateCatalogFeature('repo-1', 'nope', { effort: 'high' })).toThrow(/not found/);
    });

    it('keeps a consumed feature available for runtime updates', async () => {
      const { upsertBacklogCatalog, updateCatalogFeature } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');
      upsertBacklogCatalog(makeBacklog({ epics: [{ id: 'epic-1', title: 'Epic One', features: [] }] }), 'repo-1');
      expect(updateCatalogFeature('repo-1', 'feat-1', { effort: 'high' }).effort).toBe('high');
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

  describe('updateCatalogDefaults', () => {
    it('persists a partial defaults patch without clearing untouched fields', async () => {
      const { db, upsertBacklogCatalog, updateCatalogDefaults } = await setup();
      upsertBacklogCatalog(
        makeBacklog({
          defaults: {
            tool: 'claude',
            model: 'sonnet-5',
            effort: 'medium',
            thinking: 'off',
            skills: ['review'],
            stageSkills: {},
            workflow: {
              mode: 'staged',
              stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
              approvals: { channel: 'telegram', autoAdvance: false },
              syncTasksToBacklog: true,
              sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
              stepGuidance: {},
            },
          },
        }),
        'repo-1',
      );

      const updated = updateCatalogDefaults('repo-1', { effort: 'high' });
      expect(updated.defaults).toMatchObject({
        tool: 'claude',
        model: 'sonnet-5',
        effort: 'high',
        skills: ['review'],
      });

      const row = db
        .prepare(`SELECT defaults_json FROM backlog_catalog_meta WHERE repo_id = 'repo-1'`)
        .get() as { defaults_json: string };
      const stored = JSON.parse(row.defaults_json) as { effort: string; model: string };
      expect(stored.effort).toBe('high');
      expect(stored.model).toBe('sonnet-5');
    });

    it('updates inherited feature values while preserving workflow siblings', async () => {
      const { upsertBacklogCatalog, updateCatalogDefaults } = await setup();
      const { loadBacklogFromCatalog } = await import('../../src/core/backlog/load.js');
      upsertBacklogCatalog(makeBacklog(), 'repo-1');

      updateCatalogDefaults('repo-1', {
        effort: 'high',
        workflow: { mode: 'single', autoAdvance: true },
        maxTokens: 9000,
      });

      const feature = loadBacklogFromCatalog('repo-1').epics[0]?.features[0];
      expect(feature).toMatchObject({
        effort: 'high',
        maxTokens: 9000,
        workflow: {
          mode: 'single',
          autoAdvance: true,
          stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
          syncTasksToBacklog: true,
        },
      });
    });

    it('updates inherited autoAdvance but preserves a feature override', async () => {
      const { upsertBacklogCatalog, updateCatalogDefaults, updateCatalogFeature } = await setup();
      const { loadBacklogFromCatalog } = await import('../../src/core/backlog/load.js');
      upsertBacklogCatalog(makeBacklog(), 'repo-1');

      updateCatalogFeature('repo-1', 'feat-1', { workflow: { autoAdvance: true } });
      updateCatalogDefaults('repo-1', { workflow: { autoAdvance: false } });

      const feature = loadBacklogFromCatalog('repo-1').epics[0]?.features[0];
      expect(feature?.workflow.autoAdvance).toBe(true);

    });

    it('merges a budget patch onto existing budget fields without dropping siblings', async () => {
      const { upsertBacklogCatalog, updateCatalogDefaults } = await setup();
      upsertBacklogCatalog(makeBacklog({ budget: { maxTokens: 100000, perFeatureMaxTokens: 5000 } }), 'repo-1');

      const updated = updateCatalogDefaults('repo-1', { budget: { maxTokens: 200000 } });
      expect(updated.budget).toMatchObject({ maxTokens: 200000, perFeatureMaxTokens: 5000 });
    });

    it('sets budget from scratch when none was previously stored', async () => {
      const { upsertBacklogCatalog, updateCatalogDefaults } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');

      const updated = updateCatalogDefaults('repo-1', { budget: { maxTokens: 50000 } });
      expect(updated.budget).toMatchObject({ maxTokens: 50000 });
    });

    it('throws on an invalid patch and writes nothing', async () => {
      const { db, upsertBacklogCatalog, updateCatalogDefaults } = await setup();
      upsertBacklogCatalog(makeBacklog(), 'repo-1');

      expect(() => updateCatalogDefaults('repo-1', { tool: 'legacy-tool' as never })).toThrow();

      const row = db
        .prepare(`SELECT defaults_json FROM backlog_catalog_meta WHERE repo_id = 'repo-1'`)
        .get() as { defaults_json: string };
      const stored = JSON.parse(row.defaults_json) as { tool: string };
      expect(stored.tool).toBe('claude');
    });

    it('throws BacklogCatalogNotFoundError for an unknown repo', async () => {
      const { updateCatalogDefaults } = await setup();
      expect(() => updateCatalogDefaults('nope', { effort: 'high' })).toThrow(/not found/);
    });
  });
});
