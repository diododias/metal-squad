import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('backfillProjects', () => {
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

  async function setup() {
    home = mkdtempSync(join(tmpdir(), 'msq-backfill-'));
    process.env.HOME = home;
    process.env['MSQ_DB_PATH'] = join(home, 'app.db');

    const { getDb } = await import('../../src/db/index.js');
    const { backfillProjects } = await import('../../src/db/backfill.js');
    const { registerRepo } = await import('../../src/db/repo.js');
    const db = getDb();
    return { db, backfillProjects, registerRepo };
  }

  it('creates one implicit Project per registered repo, including empty ones', async () => {
    const { db, backfillProjects, registerRepo } = await setup();
    registerRepo('repo-1', '/tmp/repo-1');
    registerRepo('repo-2', '/tmp/repo-2');

    const result = backfillProjects(db);

    expect(result.projectsCreated).toBe(2);
    expect(result.reposLinked).toBe(2);
    const links = db.prepare(`SELECT repo_id, project_id FROM project_repos`).all() as { repo_id: string; project_id: string }[];
    expect(links).toHaveLength(2);
    expect(new Set(links.map((l) => l.repo_id))).toEqual(new Set(['repo-1', 'repo-2']));
  });

  it('names the implicit Project from backlog_catalog_meta.repo when available', async () => {
    const { db, backfillProjects, registerRepo } = await setup();
    registerRepo('repo-1', '/tmp/repo-1');
    db.prepare(
      `INSERT INTO backlog_catalog_meta (repo_id, repo, version, defaults_json) VALUES (?, ?, 2, '{}')`,
    ).run('repo-1', 'friendly-name');

    backfillProjects(db);

    const project = db.prepare(
      `SELECT p.name FROM projects p JOIN project_repos pr ON pr.project_id = p.project_id WHERE pr.repo_id = 'repo-1'`,
    ).get() as { name: string };
    expect(project.name).toBe('friendly-name');
  });

  it('falls back to basename(path) when there is no catalog meta', async () => {
    const { db, backfillProjects, registerRepo } = await setup();
    registerRepo('repo-1', '/tmp/some/nested/my-repo');

    backfillProjects(db);

    const project = db.prepare(
      `SELECT p.name FROM projects p JOIN project_repos pr ON pr.project_id = p.project_id WHERE pr.repo_id = 'repo-1'`,
    ).get() as { name: string };
    expect(project.name).toBe('my-repo');
  });

  it('backfills project_id on epics, runs and pipelines via their repo_id', async () => {
    const { db, backfillProjects, registerRepo } = await setup();
    registerRepo('repo-1', '/tmp/repo-1');
    db.prepare(
      `INSERT INTO backlog_epics (epic_id, repo_id, title, position, data_json) VALUES ('epic-1', 'repo-1', 'Epic', 0, '{}')`,
    ).run();
    db.prepare(
      `INSERT INTO runs (repo_id, feature_id, tool, status, started_at) VALUES ('repo-1', 'feat-1', 'claude', 'done', datetime('now'))`,
    ).run();
    db.prepare(
      `INSERT INTO pipelines (repo_id, feature_id, status) VALUES ('repo-1', 'feat-1', 'done')`,
    ).run();

    const result = backfillProjects(db);

    const projectId = (db.prepare(`SELECT project_id FROM project_repos WHERE repo_id = 'repo-1'`).get() as { project_id: string }).project_id;
    expect(result.epicsBackfilled).toBe(1);
    expect(result.runsBackfilled).toBe(1);
    expect(result.pipelinesBackfilled).toBe(1);
    expect((db.prepare(`SELECT project_id FROM backlog_epics WHERE epic_id = 'epic-1'`).get() as { project_id: string }).project_id).toBe(projectId);
    expect((db.prepare(`SELECT project_id FROM runs WHERE feature_id = 'feat-1'`).get() as { project_id: string }).project_id).toBe(projectId);
    expect((db.prepare(`SELECT project_id FROM pipelines WHERE feature_id = 'feat-1'`).get() as { project_id: string }).project_id).toBe(projectId);
  });

  it('rebuilds backlog_epics with project_id NOT NULL and repo_id nullable, preserving data', async () => {
    const { db, backfillProjects, registerRepo } = await setup();
    registerRepo('repo-1', '/tmp/repo-1');
    db.prepare(
      `INSERT INTO backlog_epics (epic_id, repo_id, title, position, data_json, archived_at)
       VALUES ('epic-1', 'repo-1', 'Epic One', 3, '{"id":"epic-1"}', NULL)`,
    ).run();

    backfillProjects(db);

    const columns = db.prepare(`PRAGMA table_info(backlog_epics)`).all() as { name: string; notnull: number }[];
    const projectIdCol = columns.find((c) => c.name === 'project_id');
    const repoIdCol = columns.find((c) => c.name === 'repo_id');
    expect(projectIdCol?.notnull).toBe(1);
    expect(repoIdCol?.notnull).toBe(0);

    const row = db.prepare(`SELECT epic_id, repo_id, title, position, data_json FROM backlog_epics WHERE epic_id = 'epic-1'`).get() as {
      epic_id: string; repo_id: string; title: string; position: number; data_json: string;
    };
    expect(row).toMatchObject({ epic_id: 'epic-1', repo_id: 'repo-1', title: 'Epic One', position: 3, data_json: '{"id":"epic-1"}' });
  });

  it('preserves catalog features that reference an Epic during the table rebuild', async () => {
    const { db, backfillProjects, registerRepo } = await setup();
    registerRepo('repo-1', '/tmp/repo-1');
    db.prepare(
      `INSERT INTO backlog_epics (epic_id, repo_id, title, position, data_json) VALUES ('epic-1', 'repo-1', 'Epic', 0, '{}')`,
    ).run();
    db.prepare(
      `INSERT INTO backlog_features (feature_id, epic_id, repo_id, title, position, data_json) VALUES ('feat-1', 'epic-1', 'repo-1', 'Feature', 0, '{}')`,
    ).run();

    backfillProjects(db);

    expect(db.prepare(`SELECT epic_id FROM backlog_features WHERE feature_id = 'feat-1'`).get()).toEqual({ epic_id: 'epic-1' });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('is idempotent: a second run creates no new projects, links or backfills', async () => {
    const { db, backfillProjects, registerRepo } = await setup();
    registerRepo('repo-1', '/tmp/repo-1');
    db.prepare(
      `INSERT INTO backlog_epics (epic_id, repo_id, title, position, data_json) VALUES ('epic-1', 'repo-1', 'Epic', 0, '{}')`,
    ).run();

    backfillProjects(db);
    const projectCountBefore = (db.prepare(`SELECT COUNT(*) AS n FROM projects`).get() as { n: number }).n;
    const epicUpdatedAtBefore = (db.prepare(`SELECT updated_at FROM backlog_epics WHERE epic_id = 'epic-1'`).get() as { updated_at: string }).updated_at;

    const second = backfillProjects(db);

    expect(second.projectsCreated).toBe(0);
    expect(second.reposLinked).toBe(0);
    expect(second.epicsBackfilled).toBe(0);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM projects`).get() as { n: number }).n).toBe(projectCountBefore);
    expect((db.prepare(`SELECT updated_at FROM backlog_epics WHERE epic_id = 'epic-1'`).get() as { updated_at: string }).updated_at).toBe(epicUpdatedAtBefore);
  });

  it('aborts before commit when an epic references a repo_id with no matching repos row', async () => {
    const { db, backfillProjects, registerRepo } = await setup();
    registerRepo('repo-1', '/tmp/repo-1');
    // Simulate a legacy row written before FK enforcement existed: disable
    // FK checks just for this insert so the orphan can exist in the db.
    db.pragma('foreign_keys = OFF');
    db.prepare(
      `INSERT INTO backlog_epics (epic_id, repo_id, title, position, data_json) VALUES ('epic-orphan', 'ghost-repo', 'Ghost', 0, '{}')`,
    ).run();
    db.pragma('foreign_keys = ON');

    expect(() => backfillProjects(db)).toThrow(/epic-orphan.*ghost-repo/s);

    const projectCount = (db.prepare(`SELECT COUNT(*) AS n FROM projects`).get() as { n: number }).n;
    expect(projectCount).toBe(0);
    const epic = db.prepare(`SELECT project_id FROM backlog_epics WHERE epic_id = 'epic-orphan'`).get() as { project_id: string | null };
    expect(epic.project_id).toBeNull();
  });

  it('creates a verified backup file before writing', async () => {
    const { db, backfillProjects, registerRepo } = await setup();
    registerRepo('repo-1', '/tmp/repo-1');

    const result = backfillProjects(db);

    expect(result.backupPath).toBe(join(home, 'app.db.bak'));
    expect(existsSync(result.backupPath!)).toBe(true);
  });
});
