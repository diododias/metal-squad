import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Project and repository domain queries', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-project-domain-'));
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
    const errors = await import('../../src/db/errors.js');
    return { db: dbModule.getDb('readwrite'), ...repo, ...errors };
  }

  it('creates Project rows at the next position and records complete audit context', async () => {
    const { db, createProject } = await setup();
    const first = createProject({ name: 'First', audit: { actor: 'alice', requestId: 'request-1' } });
    const second = createProject({ name: 'Second', description: 'two' });

    expect(first).toMatchObject({ name: 'First', description: null, position: 0, revision: 1 });
    expect(second).toMatchObject({ name: 'Second', description: 'two', position: 1, revision: 1 });
    expect(second.projectId).toMatch(/^[0-9a-f-]{36}$/i);

    const audit = db.prepare(
      `SELECT request_id AS requestId, actor, entity_kind AS entityKind, entity_id AS entityId,
              action, before_json AS beforeJson, after_json AS afterJson
         FROM audit_events WHERE entity_id = ?`,
    ).get(first.projectId) as Record<string, unknown>;
    expect(audit).toMatchObject({
      requestId: 'request-1', actor: 'alice', entityKind: 'project', entityId: first.projectId,
      action: 'create', beforeJson: null,
    });
    expect(JSON.parse(String(audit.afterJson))).toMatchObject({ projectId: first.projectId, revision: 1 });
  });

  it('filters archived/deleted Projects and keeps position ordering', async () => {
    const { db, createProject, getProject, listProjects } = await setup();
    const later = createProject({ name: 'Later', position: 9 });
    const first = createProject({ name: 'First', position: 1 });
    const archived = createProject({ name: 'Archived', position: 2 });
    const deleted = createProject({ name: 'Deleted', position: 3 });
    db.prepare(`UPDATE projects SET archived_at = datetime('now') WHERE project_id = ?`).run(archived.projectId);
    db.prepare(`UPDATE projects SET deleted_at = datetime('now') WHERE project_id = ?`).run(deleted.projectId);

    expect(listProjects().map((project) => project.projectId)).toEqual([first.projectId, later.projectId]);
    expect(listProjects({ includeArchived: true }).map((project) => project.projectId)).toEqual([
      first.projectId, archived.projectId, later.projectId,
    ]);
    expect(listProjects({ includeDeleted: true }).map((project) => project.projectId)).toEqual([
      first.projectId, deleted.projectId, later.projectId,
    ]);
    expect(getProject(archived.projectId)).toBeNull();
    expect(getProject(archived.projectId, { includeArchived: true })?.name).toBe('Archived');
    expect(getProject(deleted.projectId, { includeDeleted: true })?.name).toBe('Deleted');
  });

  it('uses optimistic revisions and reports a stable conflict code', async () => {
    const { db, createProject, updateProject, RevisionConflictError } = await setup();
    const project = createProject({ name: 'Before' });
    const updated = updateProject(project.projectId, { name: 'After' }, 1, {
      audit: { actor: 'bob', requestId: 'request-2' },
    });

    expect(updated).toMatchObject({ name: 'After', revision: 2 });
    expect(() => updateProject(project.projectId, { description: 'stale' }, 1)).toThrowError(
      RevisionConflictError,
    );
    try {
      updateProject(project.projectId, { description: 'stale' }, 1);
    } catch (error) {
      expect(error).toMatchObject({ code: 'REVISION_CONFLICT', expectedRevision: 1, actualRevision: 2 });
    }
    const audit = db.prepare(`SELECT before_json AS beforeJson, after_json AS afterJson FROM audit_events WHERE action = 'update'`).get() as {
      beforeJson: string; afterJson: string;
    };
    expect(JSON.parse(audit.beforeJson)).toMatchObject({ name: 'Before', revision: 1 });
    expect(JSON.parse(audit.afterJson)).toMatchObject({ name: 'After', revision: 2 });
  });

  it('links a free repo once and returns REPO_ALREADY_LINKED without overwriting it', async () => {
    const { db, createProject, linkRepo, listProjectRepos, registerRepo, RepoAlreadyLinkedError } = await setup();
    const first = createProject({ name: 'First' });
    const second = createProject({ name: 'Second' });
    registerRepo('repo-1', '/tmp/repo-1');

    expect(linkRepo(first.projectId, 'repo-1')).toMatchObject({ repoId: 'repo-1', projectId: first.projectId, position: 0 });
    expect(() => linkRepo(second.projectId, 'repo-1')).toThrowError(RepoAlreadyLinkedError);
    try {
      linkRepo(second.projectId, 'repo-1');
    } catch (error) {
      expect(error).toMatchObject({ code: 'REPO_ALREADY_LINKED' });
    }
    expect(listProjectRepos(first.projectId)).toHaveLength(1);
    expect(listProjectRepos(second.projectId)).toEqual([]);
    expect(db.prepare(`SELECT project_id FROM project_repos WHERE repo_id = 'repo-1'`).get()).toEqual({ project_id: first.projectId });
  });

  it('moves a repo atomically without reclassifying historical run snapshots', async () => {
    const { db, createProject, linkRepo, moveRepo, registerRepo } = await setup();
    const source = createProject({ name: 'Source' });
    const target = createProject({ name: 'Target' });
    registerRepo('repo-1', '/tmp/repo-1');
    linkRepo(source.projectId, 'repo-1');
    db.prepare(
      `INSERT INTO runs (repo_id, project_id, feature_id, tool) VALUES (?, ?, ?, ?)`,
    ).run('repo-1', source.projectId, 'feature-before-move', 'codex');

    expect(moveRepo('repo-1', target.projectId)).toMatchObject({ projectId: target.projectId });
    expect(db.prepare(`SELECT project_id FROM runs WHERE feature_id = 'feature-before-move'`).get()).toEqual({ project_id: source.projectId });
    expect(db.prepare(`SELECT project_id FROM project_repos WHERE repo_id = 'repo-1'`).get()).toEqual({ project_id: target.projectId });
  });

  it('blocks move and unlink when active or archived Work Items use the repo', async () => {
    const { db, createProject, linkRepo, moveRepo, unlinkRepo, registerRepo, RepoInUseError } = await setup();
    const source = createProject({ name: 'Source' });
    const target = createProject({ name: 'Target' });
    registerRepo('repo-1', '/tmp/repo-1');
    linkRepo(source.projectId, 'repo-1');
    db.prepare(
      `INSERT INTO backlog_epics (epic_id, project_id, repo_id, title, position, data_json)
       VALUES ('epic-1', ?, 'repo-1', 'Epic', 0, '{}')`,
    ).run(source.projectId);
    db.prepare(
      `INSERT INTO backlog_features (feature_id, epic_id, repo_id, title, position, data_json, archived_at)
       VALUES ('feature-1', 'epic-1', 'repo-1', 'Archived Work Item', 0, '{}', datetime('now'))`,
    ).run();

    expect(() => moveRepo('repo-1', target.projectId)).toThrowError(RepoInUseError);
    expect(() => unlinkRepo('repo-1')).toThrowError(RepoInUseError);
    expect(db.prepare(`SELECT project_id FROM project_repos WHERE repo_id = 'repo-1'`).get()).toEqual({ project_id: source.projectId });
  });

  it('rolls the mutation back when audit insertion fails in the same transaction', async () => {
    const { db, createProject, updateProject } = await setup();
    const project = createProject({ name: 'Before' });
    db.exec(`
      CREATE TRIGGER fail_project_audit
      BEFORE INSERT ON audit_events
      WHEN NEW.action = 'update'
      BEGIN
        SELECT RAISE(ABORT, 'audit insertion failed');
      END;
    `);

    expect(() => updateProject(project.projectId, { name: 'After' }, 1)).toThrow('audit insertion failed');
    expect(db.prepare(`SELECT name, revision FROM projects WHERE project_id = ?`).get(project.projectId)).toEqual({ name: 'Before', revision: 1 });
  });

  it('returns aggregate repo, epic and Work Item counts per Project', async () => {
    const { db, createProject, getProjectCounts, listProjectCounts, linkRepo, registerRepo } = await setup();
    const project = createProject({ name: 'Counts' });
    registerRepo('repo-1', '/tmp/repo-1');
    linkRepo(project.projectId, 'repo-1');
    db.prepare(
      `INSERT INTO backlog_epics (epic_id, project_id, repo_id, title, position, data_json)
       VALUES ('epic-1', ?, 'repo-1', 'Epic', 0, '{}')`,
    ).run(project.projectId);
    db.prepare(
      `INSERT INTO backlog_features (feature_id, epic_id, repo_id, title, position, data_json)
       VALUES ('feature-1', 'epic-1', 'repo-1', 'Work', 0, '{}')`,
    ).run();

    expect(getProjectCounts(project.projectId)).toEqual({
      projectId: project.projectId, repoCount: 1, epicCount: 1, workItemCount: 1,
    });
    expect(listProjectCounts()).toEqual([{
      projectId: project.projectId, repoCount: 1, epicCount: 1, workItemCount: 1,
    }]);
  });

  it('creates and updates project-level Epics without assigning an arbitrary repo or changing runs', async () => {
    const { db, createEpic, createProject, registerRepo, updateEpic, RevisionConflictError } = await setup();
    const { backfillProjects } = await import('../../src/db/backfill.js');
    backfillProjects(db);
    const project = createProject({ name: 'Epics' });
    registerRepo('run-repo', '/tmp/run-repo');
    db.prepare(`INSERT INTO runs (repo_id, feature_id, tool, status) VALUES ('run-repo', 'run-feature', 'codex', 'running')`).run();

    const epic = createEpic({
      projectId: project.projectId,
      title: 'First Epic',
      description: 'Initial scope',
      audit: { actor: 'web', requestId: 'epic-create-1' },
    });
    expect(epic).toMatchObject({ projectId: project.projectId, repoId: null, title: 'First Epic', status: 'todo', revision: 1 });
    const createdRow = db.prepare(`SELECT repo_id, status, revision, data_json FROM backlog_epics WHERE epic_id = ?`).get(epic.epicId) as {
      repo_id: string | null; status: string; revision: number; data_json: string;
    };
    expect(createdRow).toMatchObject({
      repo_id: null,
      status: 'todo',
      revision: 1,
    });
    expect(JSON.parse(createdRow.data_json)).toEqual({
      id: epic.epicId, title: 'First Epic', description: 'Initial scope', status: 'todo', features: [],
    });

    const updated = updateEpic(epic.epicId, { status: 'in_progress', description: null }, 1, {
      audit: { actor: 'web', requestId: 'epic-update-1' },
    });
    expect(updated).toMatchObject({ status: 'in_progress', description: null, revision: 2 });
    expect(db.prepare(`SELECT status FROM runs WHERE feature_id = 'run-feature'`).get()).toEqual({ status: 'running' });
    expect(JSON.parse((db.prepare(`SELECT data_json FROM backlog_epics WHERE epic_id = ?`).get(epic.epicId) as { data_json: string }).data_json)).toEqual({
      id: epic.epicId, title: 'First Epic', status: 'in_progress', features: [],
    });
    expect(db.prepare(`SELECT request_id, actor, entity_kind, action FROM audit_events WHERE entity_id = ? ORDER BY id`).all(epic.epicId)).toEqual([
      { request_id: 'epic-create-1', actor: 'web', entity_kind: 'epic', action: 'create' },
      { request_id: 'epic-update-1', actor: 'web', entity_kind: 'epic', action: 'update' },
    ]);
    expect(() => updateEpic(epic.epicId, { title: 'stale' }, 1)).toThrowError(RevisionConflictError);
  });
});
