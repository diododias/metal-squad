import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
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

  it('refuses an unsafe path before registering it through the repository link service', async () => {
    const { db, createProject } = await setup();
    const project = createProject({ name: 'Safe links only' });
    const allowedRoot = mkdtempSync(join(tmpdir(), 'msq-allowed-repos-'));
    const outside = mkdtempSync(join(tmpdir(), 'msq-outside-repos-'));
    const escapingLink = join(allowedRoot, 'outside-link');
    symlinkSync(outside, escapingLink);
    const { repoLinkService } = await import('../../src/core/projectService.js');

    expect(() => repoLinkService.link(project.projectId, {
      path: escapingLink,
      confirm: true,
    }, { allowedRoots: [allowedRoot] })).toThrow(expect.objectContaining({ code: 'REPO_PATH_NOT_ALLOWED' }));
    expect(db.prepare(`SELECT COUNT(*) AS count FROM repos`).get()).toEqual({ count: 0 });

    rmSync(allowedRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
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

  it('does not unlink a repo when the request names a different Project', async () => {
    const { createProject, linkRepo, unlinkRepo, registerRepo, RepoNotLinkedToProjectError } = await setup();
    const owner = createProject({ name: 'Owner' });
    const other = createProject({ name: 'Other' });
    registerRepo('repo-1', '/tmp/repo-1');
    linkRepo(owner.projectId, 'repo-1');

    expect(() => unlinkRepo('repo-1', { projectId: other.projectId })).toThrowError(RepoNotLinkedToProjectError);
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

  it('returns global state summaries from SQLite without inspecting repository paths', async () => {
    const { db, createProject, getProjectStateRevision, linkRepo, listProjectStateSummaries, listRepositoryStateSummaries, registerRepo } = await setup();
    const project = createProject({ name: 'State' });
    registerRepo('repo-1', '/private/repos/state');
    linkRepo(project.projectId, 'repo-1');
    db.prepare(`INSERT INTO backlog_epics (epic_id, project_id, repo_id, title, position, data_json) VALUES ('epic-1', ?, 'repo-1', 'Epic', 0, '{}')`).run(project.projectId);
    db.prepare(`INSERT INTO backlog_features (feature_id, epic_id, repo_id, title, position, data_json, archived_at) VALUES ('work-old', 'epic-1', 'repo-1', 'Old', 0, '{}', datetime('now'))`).run();
    db.prepare(`INSERT INTO runs (repo_id, project_id, feature_id, tool, status, total_tokens) VALUES ('repo-1', ?, 'work-live', 'codex', 'running', 55)`).run(project.projectId);

    expect(listProjectStateSummaries()).toEqual([expect.objectContaining({
      projectId: project.projectId, epicCount: 1, workItemCount: 0, archivedCount: 1,
      activeRuns: 1, totalTokens: 55,
    })]);
    expect(listRepositoryStateSummaries()).toEqual([{
      repoId: 'repo-1', projectId: project.projectId, path: '/private/repos/state',
    }]);
    expect(getProjectStateRevision()).toBeGreaterThan(0);
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

    const updated = updateEpic(epic.epicId, { description: null }, 1, {
      audit: { actor: 'web', requestId: 'epic-update-1' },
    });
    expect(updated).toMatchObject({ status: 'todo', description: null, revision: 2 });
    expect(db.prepare(`SELECT status FROM runs WHERE feature_id = 'run-feature'`).get()).toEqual({ status: 'running' });
    expect(JSON.parse((db.prepare(`SELECT data_json FROM backlog_epics WHERE epic_id = ?`).get(epic.epicId) as { data_json: string }).data_json)).toEqual({
      id: epic.epicId, title: 'First Epic', status: 'todo', features: [],
    });
    expect(db.prepare(`SELECT request_id, actor, entity_kind, action FROM audit_events WHERE entity_id = ? ORDER BY id`).all(epic.epicId)).toEqual([
      { request_id: 'epic-create-1', actor: 'web', entity_kind: 'epic', action: 'create' },
      { request_id: 'epic-update-1', actor: 'web', entity_kind: 'epic', action: 'update' },
    ]);
    expect(() => updateEpic(epic.epicId, { title: 'stale' }, 1)).toThrowError(RevisionConflictError);
  });

  it('creates a Work Item in its Epic Project with materialized defaults and a public workItemId', async () => {
    const { db, createEpic, createProject, createWorkItem, linkRepo, registerRepo } = await setup();
    const { backfillProjects } = await import('../../src/db/backfill.js');
    backfillProjects(db);
    const repoPath = join(directory, 'repo-a');
    mkdirSync(repoPath);
    const project = createProject({ name: 'Work Items' });
    registerRepo('repo-a', repoPath);
    linkRepo(project.projectId, 'repo-a');
    db.prepare(`INSERT INTO backlog_catalog_meta (repo_id, repo, version, defaults_json) VALUES (?, ?, ?, ?)`).run(
      'repo-a', 'repo-a', 2, JSON.stringify({ tool: 'codex', effort: 'high', skills: ['review'], workflow: { stages: ['plan', 'implement'] } }),
    );
    const epic = createEpic({ projectId: project.projectId, title: 'Target epic' });

    const created = createWorkItem({
      epicId: epic.epicId,
      repoId: 'repo-a',
      title: '  Create from repository  ',
      description: 'Created directly',
      audit: { actor: 'test', requestId: 'work-item-create-1' },
    });

    expect(created).toMatchObject({
      workItemId: expect.stringMatching(/^F-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/),
      epicId: epic.epicId,
      repoId: 'repo-a',
      title: '  Create from repository  ',
      description: 'Created directly',
      type: 'feature',
      tool: 'codex', effort: 'high', skills: ['review'],
      workflow: expect.objectContaining({ stages: ['plan', 'implement'] }), revision: 1,
    });
    const stored = db.prepare(`SELECT feature_id, description, depends_on, data_json FROM backlog_features WHERE feature_id = ?`).get(created.workItemId) as {
      feature_id: string; description: string; depends_on: string; data_json: string;
    };
    expect(stored.feature_id).toBe(created.workItemId);
    expect(stored.description).toBe('Created directly');
    expect(JSON.parse(stored.depends_on)).toEqual([]);
    expect(JSON.parse(stored.data_json)).toMatchObject({ id: created.workItemId, type: 'feature', description: 'Created directly' });
    expect(db.prepare(`SELECT entity_kind, entity_id, action FROM audit_events WHERE request_id = ?`).get('work-item-create-1')).toEqual({
      entity_kind: 'work_item', entity_id: created.workItemId, action: 'create',
    });
  });

  it('rejects a Work Item dependency from another repository before inserting', async () => {
    const { db, createEpic, createProject, createWorkItem, linkRepo, registerRepo, CrossRepositoryDependencyError } = await setup();
    const { backfillProjects } = await import('../../src/db/backfill.js');
    backfillProjects(db);
    const repoAPath = join(directory, 'repo-a');
    const repoBPath = join(directory, 'repo-b');
    mkdirSync(repoAPath);
    mkdirSync(repoBPath);
    const project = createProject({ name: 'Shared project' });
    registerRepo('repo-a', repoAPath);
    registerRepo('repo-b', repoBPath);
    linkRepo(project.projectId, 'repo-a');
    linkRepo(project.projectId, 'repo-b');
    const epic = createEpic({ projectId: project.projectId, title: 'Epic' });
    const dependency = createWorkItem({ epicId: epic.epicId, repoId: 'repo-b', title: 'Dependency' });

    expect(() => createWorkItem({
      epicId: epic.epicId, repoId: 'repo-a', title: 'Invalid', dependsOn: [dependency.workItemId],
    })).toThrowError(CrossRepositoryDependencyError);
  });

  it('reopens only a failed Work Item into TODO and can mark that failure done manually', async () => {
    const { db, createEpic, createProject, createRun, createWorkItem, finishRun, linkRepo, listCompletedFeatureIds, listRunHistoryForFeature, listRunsForTui, markFailedWorkItemDone, registerRepo, reopenFailedWorkItem } = await setup();
    const { backfillProjects } = await import('../../src/db/backfill.js');
    backfillProjects(db);
    const repoPath = join(directory, 'repo-transitions');
    mkdirSync(repoPath);
    const project = createProject({ name: 'Transitions' });
    registerRepo('repo-transitions', repoPath);
    linkRepo(project.projectId, 'repo-transitions');
    const epic = createEpic({ projectId: project.projectId, title: 'Epic' });

    const reopened = createWorkItem({ epicId: epic.epicId, repoId: 'repo-transitions', title: 'Reopen me' });
    finishRun(createRun('repo-transitions', reopened.workItemId, 'codex'), 'failed');
    const reopenedAfter = reopenFailedWorkItem(reopened.workItemId, reopened.revision, { audit: { actor: 'web', requestId: 'reopen-1' } });
    expect(reopenedAfter.revision).toBe(2);
    expect(listRunsForTui(20, 'repo-transitions').find((run) => run.featureId === reopened.workItemId)).toBeUndefined();
    expect(listRunHistoryForFeature('repo-transitions', reopened.workItemId)).toHaveLength(1);

    const manual = createWorkItem({ epicId: epic.epicId, repoId: 'repo-transitions', title: 'Mark me done' });
    finishRun(createRun('repo-transitions', manual.workItemId, 'codex'), 'failed');
    const doneAfter = markFailedWorkItemDone(manual.workItemId, manual.revision, { audit: { actor: 'web', requestId: 'done-1' } });
    expect(doneAfter.revision).toBe(2);
    expect(listRunsForTui(20, 'repo-transitions').find((run) => run.featureId === manual.workItemId)?.status).toBe('done');
    expect(listCompletedFeatureIds('repo-transitions')).toContain(manual.workItemId);
  });

  it('rolls back Work Item insertion when its audit event fails', async () => {
    const { db, createEpic, createProject, createWorkItem, linkRepo, registerRepo } = await setup();
    const { backfillProjects } = await import('../../src/db/backfill.js');
    backfillProjects(db);
    const repoPath = join(directory, 'repo-a');
    mkdirSync(repoPath);
    const project = createProject({ name: 'Atomic' });
    registerRepo('repo-a', repoPath);
    linkRepo(project.projectId, 'repo-a');
    const epic = createEpic({ projectId: project.projectId, title: 'Epic' });
    db.exec(`CREATE TRIGGER fail_work_item_audit BEFORE INSERT ON audit_events WHEN NEW.entity_kind = 'work_item' BEGIN SELECT RAISE(ABORT, 'audit failed'); END;`);

    expect(() => createWorkItem({ epicId: epic.epicId, repoId: 'repo-a', title: 'Atomic item' })).toThrow('audit failed');
    expect(db.prepare(`SELECT COUNT(*) AS count FROM backlog_features`).get()).toEqual({ count: 0 });
  });
});
