import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('db fixture scenarios', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    vi.resetModules();
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-fixture-'));
    process.env['MSQ_DB_PATH'] = join(directory, 'app.db');
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) delete process.env['MSQ_DB_PATH'];
    else process.env['MSQ_DB_PATH'] = previousDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  it('refuses to seed the global catalog', async () => {
    delete process.env['MSQ_DB_PATH'];
    const { applyFixtureScenario } = await import('../../src/db/fixtures.js');
    expect(() => applyFixtureScenario('settings')).toThrow(/sandbox databases/);
  });

  it('seeds the settings scenario deterministically', async () => {
    const { applyFixtureScenario } = await import('../../src/db/fixtures.js');
    ({ resetDb } = await import('../../src/db/index.js'));
    const { listCatalogEpics, listCatalogTasks, getCatalogFeature } = await import('../../src/db/backlogCatalog.js');

    const result = applyFixtureScenario('settings');

    expect(result.repoId).toBe('fixture/settings');
    expect(result.epics).toBe(1);
    expect(result.features).toBe(2);
    expect(existsSync(join(directory, 'app.db'))).toBe(true);

    const epics = listCatalogEpics('fixture/settings');
    expect(epics.map((epic) => epic.epic_id)).toEqual(['fix-settings']);

    const inherit = getCatalogFeature('fixture/settings', 'fix-set-inherit');
    expect(inherit?.tool).toBe('codex');
    expect(inherit?.model).toBe('gpt-5.6-terra');
    expect(inherit?.effort).toBe('high');
    expect(inherit?.skills).toEqual(['dev-flow']);

    const override = getCatalogFeature('fixture/settings', 'fix-set-override');
    expect(override?.tool).toBe('claude');
    expect(override?.model).toBe('claude-opus-4-8');
    expect(override?.effort).toBe('low');
    expect(override?.thinking).toBe('on');
    expect(override?.dependsOn).toEqual(['fix-set-inherit']);
    expect(override?.workflow.stages).toEqual(['specify', 'implement', 'validate']);
    expect(override?.workflow.autoAdvance).toBe(true);
    expect(override?.workflow.sessionPolicy.alwaysIsolatedStages).toEqual(['validate']);

    const tasks = listCatalogTasks('fixture/settings', 'fix-set-override');
    expect(tasks.map((task) => task.task_id)).toEqual(['fix-set-override-t1', 'fix-set-override-t2']);
  });

  it('is idempotent when applied twice', async () => {
    const { applyFixtureScenario } = await import('../../src/db/fixtures.js');
    ({ resetDb } = await import('../../src/db/index.js'));

    applyFixtureScenario('settings');
    const second = applyFixtureScenario('settings');

    expect(second.diff.addedFeatures).toEqual([]);
    expect(second.diff.changedFeatures).toEqual([]);
    expect(second.diff.unchangedFeatures).toHaveLength(2);
  });
});
