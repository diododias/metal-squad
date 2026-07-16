import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getPendingFeatures, type FeatureCatalogEntry } from '../../src/ui/catalog.js';
import type { BacklogV2 } from '../../src/core/backlog/schema.js';

function feature(overrides: Partial<FeatureCatalogEntry>): FeatureCatalogEntry {
  return {
    id: 'feat-1',
    title: 'Feature',
    skills: [],
    tool: 'claude',
    effort: 'medium',
    dependsOn: [],
    workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
    autoStart: false,
    ...overrides,
  };
}

describe('getPendingFeatures', () => {
  it('excludes features already completed per SQLite pipeline history', () => {
    const catalog = {
      'feat-1': feature({ id: 'feat-1' }),
      'feat-2': feature({ id: 'feat-2' }),
    };

    const pending = getPendingFeatures(catalog, new Set(['feat-1']), new Set());

    expect(pending.map((f) => f.id)).toEqual(['feat-2']);
  });

  it('still excludes features that are active per run history', () => {
    const catalog = {
      'feat-1': feature({ id: 'feat-1' }),
      'feat-2': feature({ id: 'feat-2' }),
    };

    const pending = getPendingFeatures(catalog, new Set(), new Set(['feat-1']));

    expect(pending.map((f) => f.id)).toEqual(['feat-2']);
  });

  it('projects pendingDependencies for manual-start guardrails', () => {
    const catalog = {
      'feat-1': feature({ id: 'feat-1', dependsOn: ['feat-0'] }),
    };

    const pending = getPendingFeatures(catalog, new Set(), new Set());

    expect(pending[0]?.pendingDependencies).toEqual(['feat-0']);
  });
});

describe('autoStart projection', () => {
  it('defaults to false when not specified', () => {
    const f = feature({ id: 'feat-1' });
    expect(f.autoStart).toBe(false);
  });

  it('preserves true when specified', () => {
    const f = feature({ id: 'feat-1', autoStart: true });
    expect(f.autoStart).toBe(true);
  });

  it('includes autoStart in pending features', () => {
    const catalog = {
      'feat-1': feature({ id: 'feat-1', autoStart: true }),
      'feat-2': feature({ id: 'feat-2', autoStart: false }),
    };

    const pending = getPendingFeatures(catalog, new Set(), new Set());

    expect(pending).toHaveLength(2);
    expect(pending.find((f) => f.id === 'feat-1')?.autoStart).toBe(true);
    expect(pending.find((f) => f.id === 'feat-2')?.autoStart).toBe(false);
  });
});

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
            tasks: [],
            workflow: {
              mode: 'staged',
              stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
              approvals: { channel: 'telegram', autoAdvance: false },
              syncTasksToBacklog: true,
              sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('getBacklogSettings projectDefaults (SET-16)', () => {
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

  async function setup(cwd: string) {
    home = mkdtempSync(join(tmpdir(), 'msq-catalog-'));
    process.env.HOME = home;
    process.env['MSQ_DB_PATH'] = join(home, 'app.db');

    await import('../../src/db/index.js').then(({ getDb }) => getDb());
    const { resolveRepo } = await import('../../src/core/repo.js');
    const { registerRepo } = await import('../../src/db/repo.js');
    const { upsertBacklogCatalog, updateCatalogDefaults } = await import('../../src/db/backlogCatalog.js');
    const { getBacklogSettings } = await import('../../src/ui/catalog.js');

    const { repoId } = resolveRepo(cwd);
    registerRepo(repoId, cwd);
    return { repoId, upsertBacklogCatalog, updateCatalogDefaults, getBacklogSettings };
  }

  it('exposes raw projectDefaults separate from the resolved merge', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'msq-catalog-cwd-'));
    try {
      const { repoId, upsertBacklogCatalog, getBacklogSettings } = await setup(cwd);
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
        repoId,
      );

      const settings = getBacklogSettings(cwd);

      expect(settings.projectDefaults).toMatchObject({ tool: 'claude', model: 'sonnet-5', effort: 'medium', skills: ['review'] });
      expect(settings.resolvedDefaults).toBeDefined();
      expect(settings.projectDefaults).not.toBe(settings.resolvedDefaults);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('falls back to schema defaults when no catalog was ever loaded for the project', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'msq-catalog-cwd-'));
    try {
      const { getBacklogSettings } = await setup(cwd);
      const settings = getBacklogSettings(cwd);
      expect(settings.projectDefaults).toEqual({
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
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('reflects a projectDefaults write on the very next read, without restart', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'msq-catalog-cwd-'));
    try {
      const { repoId, upsertBacklogCatalog, updateCatalogDefaults, getBacklogSettings } = await setup(cwd);
      upsertBacklogCatalog(makeBacklog(), repoId);

      expect(getBacklogSettings(cwd).projectDefaults.effort).toBe('medium');

      updateCatalogDefaults(repoId, { effort: 'high' });

      expect(getBacklogSettings(cwd).projectDefaults.effort).toBe('high');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
