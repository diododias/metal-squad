import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

/**
 * PRJ-17 — Policy engine of archive/delete and tombstones.
 *
 * Covers the full decision matrix (pristine / running / historical) across the
 * three levels, every blocking reference for delete, and the Start race: the
 * classification and the write share one transaction, so a run inserted after
 * the check would still not corrupt state.
 */
describe('Lifecycle policy engine (archive/delete/restore)', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-lifecycle-'));
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
    const { backfillProjects } = await import('../../src/db/backfill.js');
    const db = dbModule.getDb('readwrite');
    backfillProjects(db);
    return { db, ...repo, ...errors };
  }

  interface Fixture {
    db: Database.Database;
    projectId: string;
    epicId: string;
    workItemId: string;
    repoId: string;
  }

  /** Seeds Project -> repo -> Epic -> one Work Item, all pristine. */
  async function seed(env: Awaited<ReturnType<typeof setup>>, repoId = 'repo-a'): Promise<Fixture> {
    const { db, createProject, createEpic, createWorkItem, linkRepo, registerRepo } = env;
    const repoPath = join(directory, repoId);
    mkdirSync(repoPath, { recursive: true });
    const project = createProject({ name: `Project ${repoId}` });
    registerRepo(repoId, repoPath);
    linkRepo(project.projectId, repoId);
    db.prepare(`INSERT INTO backlog_catalog_meta (repo_id, repo, version, defaults_json) VALUES (?, ?, ?, ?)`).run(
      repoId, repoId, 2, JSON.stringify({ tool: 'codex', effort: 'high', skills: ['review'], workflow: { stages: ['plan', 'implement'] } }),
    );
    const epic = createEpic({ projectId: project.projectId, title: `Epic ${repoId}` });
    const workItem = createWorkItem({ epicId: epic.epicId, repoId, title: `Work ${repoId}` });
    return { db, projectId: project.projectId, epicId: epic.epicId, workItemId: workItem.workItemId, repoId };
  }

  function insertRun(db: Database.Database, repoId: string, workItemId: string, status: string): number {
    const result = db.prepare(
      `INSERT INTO runs (repo_id, feature_id, tool, status, ended_at)
       VALUES (?, ?, 'codex', ?, CASE WHEN ? = 'running' THEN NULL ELSE datetime('now') END)`,
    ).run(repoId, workItemId, status, status);
    return Number(result.lastInsertRowid);
  }

  function insertPipeline(db: Database.Database, repoId: string, workItemId: string, status: string): number {
    const result = db.prepare(
      `INSERT INTO pipelines (repo_id, feature_id, status) VALUES (?, ?, ?)`,
    ).run(repoId, workItemId, status);
    return Number(result.lastInsertRowid);
  }

  function currentRevision(db: Database.Database, table: string, idCol: string, id: string): number {
    return (db.prepare(`SELECT revision FROM ${table} WHERE ${idCol} = ?`).get(id) as { revision: number }).revision;
  }

  it('derives Epic status atomically from Work Item run transitions', async () => {
    const env = await setup();
    const { db, createRun, createWorkItem, finishRun, getEpic } = env;
    const first = await seed(env);
    const second = createWorkItem({ epicId: first.epicId, repoId: first.repoId, title: 'Second Work Item' });

    const firstRun = createRun(first.repoId, first.workItemId, 'codex');
    expect(getEpic(first.epicId)?.status).toBe('in_progress');

    finishRun(firstRun, 'done');
    expect(getEpic(first.epicId)?.status).toBe('in_progress');

    const secondRun = createRun(first.repoId, second.workItemId, 'codex');
    finishRun(secondRun, 'done');
    expect(getEpic(first.epicId)?.status).toBe('in_review');

    const persisted = db.prepare(`SELECT status, data_json FROM backlog_epics WHERE epic_id = ?`).get(first.epicId) as { status: string; data_json: string };
    expect(persisted.status).toBe('in_review');
    expect(JSON.parse(persisted.data_json)).toMatchObject({ status: 'in_review' });
  });

  it('preserves a legacy done Epic while runs are migrated into the new lifecycle', async () => {
    const env = await setup();
    const { db, createRun, getEpic } = env;
    const fixture = await seed(env);
    db.prepare(`UPDATE backlog_epics SET status = 'done' WHERE epic_id = ?`).run(fixture.epicId);

    createRun(fixture.repoId, fixture.workItemId, 'codex');
    expect(getEpic(fixture.epicId)?.status).toBe('done');
  });

  // --- Work Item matrix ---------------------------------------------------

  it('archives and deletes a pristine Work Item, keeping the ID reserved', async () => {
    const env = await setup();
    const { db, archiveWorkItem, deleteWorkItem } = env;
    const { listOccupiedFeatureIds } = await import('../../src/db/backlogCatalog.js');
    const { workItemId } = await seed(env);

    const archived = archiveWorkItem(workItemId, 1, { audit: { actor: 'test', requestId: 'wi-arch' } });
    expect(archived.revision).toBe(2);
    expect(db.prepare(`SELECT archived_at FROM backlog_features WHERE feature_id = ?`).get(workItemId)).toMatchObject({ archived_at: expect.any(String) });

    // delete requires the current revision (archive bumped it to 2)
    deleteWorkItem(workItemId, 2, { audit: { actor: 'test', requestId: 'wi-del' } });
    const row = db.prepare(`SELECT archived_at, deleted_at FROM backlog_features WHERE feature_id = ?`).get(workItemId) as { archived_at: string | null; deleted_at: string | null };
    expect(row.archived_at).toBeNull();
    expect(row.deleted_at).not.toBeNull();

    // tombstone keeps the ID occupied
    expect(listOccupiedFeatureIds().has(workItemId)).toBe(true);

    const audit = db.prepare(`SELECT action FROM audit_events WHERE entity_id = ? ORDER BY id`).all(workItemId).map((r) => (r as { action: string }).action);
    expect(audit).toEqual(['create', 'archive', 'delete']);
  });

  it('refuses archive and delete on a running Work Item', async () => {
    const env = await setup();
    const { db, archiveWorkItem, deleteWorkItem, EntityRunningError } = env;
    const { workItemId, repoId } = await seed(env);
    insertRun(db, repoId, workItemId, 'running');

    expect(() => archiveWorkItem(workItemId, 1)).toThrowError(EntityRunningError);
    expect(() => deleteWorkItem(workItemId, 1)).toThrowError(EntityRunningError);
    expect(currentRevision(db, 'backlog_features', 'feature_id', workItemId)).toBe(1);
  });

  it('treats a blocked/paused pipeline as running, not historical', async () => {
    const env = await setup();
    const { db, archiveWorkItem, EntityRunningError } = env;
    const { workItemId, repoId } = await seed(env);
    insertPipeline(db, repoId, workItemId, 'blocked');
    expect(() => archiveWorkItem(workItemId, 1)).toThrowError(EntityRunningError);
  });

  it('archives a historical Work Item but refuses to delete it', async () => {
    const env = await setup();
    const { db, archiveWorkItem, deleteWorkItem, EntityHasHistoryError } = env;
    const { workItemId, repoId } = await seed(env);
    insertRun(db, repoId, workItemId, 'done');

    const archived = archiveWorkItem(workItemId, 1);
    expect(archived.revision).toBe(2);
    expect(() => deleteWorkItem(workItemId, 2)).toThrowError(EntityHasHistoryError);
  });

  it.each(['failed', 'aborted'])('recognises %s runs as history (archivable, not deletable)', async (status) => {
    const env = await setup();
    const { db, archiveWorkItem, deleteWorkItem, EntityHasHistoryError } = env;
    const { workItemId, repoId } = await seed(env);
    insertRun(db, repoId, workItemId, status);
    expect(archiveWorkItem(workItemId, 1).revision).toBe(2);
    expect(() => deleteWorkItem(workItemId, 2)).toThrowError(EntityHasHistoryError);
  });

  it('refuses to delete a pristine Work Item that a downstream item depends on', async () => {
    const env = await setup();
    const { createWorkItem, deleteWorkItem, EntityInUseError } = env;
    const base = await seed(env);
    const downstream = createWorkItem({ epicId: base.epicId, repoId: base.repoId, title: 'Downstream', dependsOn: [base.workItemId] });
    expect(downstream.dependsOn).toContain(base.workItemId);

    expect(() => deleteWorkItem(base.workItemId, 1)).toThrowError(EntityInUseError);
    // once the downstream is tombstoned it no longer blocks
    deleteWorkItem(downstream.workItemId, 1);
    expect(() => deleteWorkItem(base.workItemId, 1)).not.toThrow();
  });

  it('refuses to delete a pristine Work Item that has a topic association', async () => {
    const env = await setup();
    const { db, deleteWorkItem, EntityInUseError } = env;
    const topicItem = await seed(env, 'repo-topic');
    db.prepare(`INSERT INTO feature_topic_associations (chat_id, feature_id, title) VALUES ('chat', ?, 'topic')`).run(topicItem.workItemId);
    expect(() => deleteWorkItem(topicItem.workItemId, 1)).toThrowError(EntityInUseError);
  });

  it('classifies an unresolved gate as running, blocking archive and delete', async () => {
    const env = await setup();
    const { db, archiveWorkItem, deleteWorkItem, EntityRunningError } = env;
    const gateItem = await seed(env, 'repo-gate');
    const runId = insertRun(db, gateItem.repoId, gateItem.workItemId, 'done');
    db.prepare(`INSERT INTO gates (run_id, feature_id, repo_id) VALUES (?, ?, ?)`).run(runId, gateItem.workItemId, gateItem.repoId);
    expect(() => archiveWorkItem(gateItem.workItemId, 1)).toThrowError(EntityRunningError);
    expect(() => deleteWorkItem(gateItem.workItemId, 1)).toThrowError(EntityRunningError);
  });

  it('restores an archived Work Item and enforces revision', async () => {
    const env = await setup();
    const { db, archiveWorkItem, restoreArchivedWorkItem, RevisionConflictError } = env;
    const { workItemId } = await seed(env);
    archiveWorkItem(workItemId, 1);
    expect(() => restoreArchivedWorkItem(workItemId, 1)).toThrowError(RevisionConflictError);
    const restored = restoreArchivedWorkItem(workItemId, 2);
    expect(db.prepare(`SELECT archived_at FROM backlog_features WHERE feature_id = ?`).get(workItemId)).toMatchObject({ archived_at: null });
    expect(restored.revision).toBe(3);
  });

  it('refuses to restore a Work Item whose Epic is archived', async () => {
    const env = await setup();
    const { archiveWorkItem, archiveEpic, restoreArchivedWorkItem, AncestorArchivedError } = env;
    const { workItemId, epicId } = await seed(env);
    archiveWorkItem(workItemId, 1);
    archiveEpic(epicId, 1);
    expect(() => restoreArchivedWorkItem(workItemId, 2)).toThrowError(AncestorArchivedError);
  });

  // PRJ-19: restoring a Work Item requires its repository to still be linked
  // to the same Project as its Epic. `unlinkRepo`/`moveRepo` already refuse
  // this while a non-deleted (including archived) Work Item still references
  // the repo, so the scenario below drives `project_repos` directly — the
  // same defense-in-depth the repo layer applies for every other lifecycle
  // mutation, exercised here for the case a future relaxation of that guard
  // could otherwise leave a restored Work Item orphaned.
  it('refuses to restore a Work Item whose repository was unlinked from its Project', async () => {
    const env = await setup();
    const { db, archiveWorkItem, restoreArchivedWorkItem, RepositoryNotInProjectError } = env;
    const { workItemId, repoId } = await seed(env);
    archiveWorkItem(workItemId, 1);
    db.prepare(`DELETE FROM project_repos WHERE repo_id = ?`).run(repoId);
    expect(() => restoreArchivedWorkItem(workItemId, 2)).toThrowError(RepositoryNotInProjectError);
  });

  it('refuses to restore a Work Item whose repository moved to another Project', async () => {
    const env = await setup();
    const { db, createProject, archiveWorkItem, restoreArchivedWorkItem, RepositoryNotInProjectError } = env;
    const { workItemId, repoId } = await seed(env);
    archiveWorkItem(workItemId, 1);
    const otherProject = createProject({ name: 'Other project' });
    db.prepare(`UPDATE project_repos SET project_id = ? WHERE repo_id = ?`).run(otherProject.projectId, repoId);
    expect(() => restoreArchivedWorkItem(workItemId, 2)).toThrowError(RepositoryNotInProjectError);
  });

  // --- Epic matrix --------------------------------------------------------

  it('deletes an Epic only after every Work Item is tombstoned', async () => {
    const env = await setup();
    const { deleteEpic, deleteWorkItem, EntityInUseError } = env;
    const { epicId, workItemId } = await seed(env);
    expect(() => deleteEpic(epicId, 1)).toThrowError(EntityInUseError);
    deleteWorkItem(workItemId, 1);
    expect(() => deleteEpic(epicId, 1)).not.toThrow();
  });

  it('refuses to delete an Epic with a running Work Item', async () => {
    const env = await setup();
    const { db, deleteEpic, archiveEpic, EntityRunningError } = env;
    const { epicId, workItemId, repoId } = await seed(env);
    insertPipeline(db, repoId, workItemId, 'running');
    expect(() => archiveEpic(epicId, 1)).toThrowError(EntityRunningError);
    expect(() => deleteEpic(epicId, 1)).toThrowError(EntityRunningError);
  });

  it('archives an Epic with historical Work Items but refuses to delete it', async () => {
    const env = await setup();
    const { db, archiveEpic, deleteEpic, EntityHasHistoryError } = env;
    const { epicId, workItemId, repoId } = await seed(env);
    insertRun(db, repoId, workItemId, 'done');
    expect(archiveEpic(epicId, 1).revision).toBe(2);
    expect(() => deleteEpic(epicId, 2)).toThrowError(EntityHasHistoryError);
  });

  // --- Project matrix -----------------------------------------------------

  it('deletes a Project only after Epics are tombstoned and repos unlinked', async () => {
    const env = await setup();
    const { deleteProject, deleteEpic, deleteWorkItem, unlinkRepo, EntityInUseError } = env;
    const { projectId, epicId, workItemId, repoId } = await seed(env);

    expect(() => deleteProject(projectId, 1)).toThrowError(EntityInUseError); // undeleted epic
    deleteWorkItem(workItemId, 1);
    deleteEpic(epicId, 1);
    expect(() => deleteProject(projectId, 1)).toThrowError(EntityInUseError); // repo still linked
    unlinkRepo(repoId);
    expect(() => deleteProject(projectId, 1)).not.toThrow();
  });

  it('archives a Project without touching its children', async () => {
    const env = await setup();
    const { db, archiveProject } = env;
    const { projectId, epicId, workItemId } = await seed(env);
    archiveProject(projectId, 1);
    expect(db.prepare(`SELECT archived_at FROM backlog_epics WHERE epic_id = ?`).get(epicId)).toMatchObject({ archived_at: null });
    expect(db.prepare(`SELECT archived_at FROM backlog_features WHERE feature_id = ?`).get(workItemId)).toMatchObject({ archived_at: null });
  });

  it('refuses to archive a Project with a running descendant', async () => {
    const env = await setup();
    const { db, archiveProject, EntityRunningError } = env;
    const { projectId, workItemId, repoId } = await seed(env);
    insertRun(db, repoId, workItemId, 'running');
    expect(() => archiveProject(projectId, 1)).toThrowError(EntityRunningError);
  });

  it('refuses to restore an Epic while its Project is archived', async () => {
    const env = await setup();
    const { archiveEpic, archiveProject, restoreArchivedEpic, AncestorArchivedError } = env;
    const { projectId, epicId } = await seed(env);
    archiveEpic(epicId, 1);
    archiveProject(projectId, 1);
    expect(() => restoreArchivedEpic(epicId, 2)).toThrowError(AncestorArchivedError);
  });

  // --- Start race ---------------------------------------------------------

  it('a Start racing a delete cannot leave partial state: revision guards one winner', async () => {
    const env = await setup();
    const { db, deleteWorkItem, RevisionConflictError } = env;
    const { workItemId, repoId } = await seed(env);

    // Simulate Start winning: it bumps the row (as any concurrent mutation
    // would) before the delete commits. The delete then loses on revision.
    db.prepare(`UPDATE backlog_features SET revision = revision + 1 WHERE feature_id = ?`).run(workItemId);
    insertRun(db, repoId, workItemId, 'running');

    expect(() => deleteWorkItem(workItemId, 1)).toThrowError(RevisionConflictError);
    const row = db.prepare(`SELECT deleted_at FROM backlog_features WHERE feature_id = ?`).get(workItemId) as { deleted_at: string | null };
    expect(row.deleted_at).toBeNull();
  });

  it('the classification and the write commit atomically (delete sees a run inserted before it)', async () => {
    const env = await setup();
    const { db, deleteWorkItem, EntityRunningError } = env;
    const { workItemId, repoId } = await seed(env);
    // A run present at check time forces the running verdict inside the same
    // transaction — no window where the delete could commit against a run.
    insertRun(db, repoId, workItemId, 'running');
    expect(() => deleteWorkItem(workItemId, 1)).toThrowError(EntityRunningError);
  });

  // --- PRJ-19: /archived listing and audit trail ---------------------------

  it('lists archived Projects and Epics paginated, most recently archived first', async () => {
    const env = await setup();
    const { archiveProject, listArchivedProjects, countArchivedProjects, archiveEpic, listArchivedEpics, countArchivedEpics } = env;
    const first = await seed(env, 'repo-a');
    const second = await seed(env, 'repo-b');

    expect(listArchivedProjects()).toHaveLength(0);
    archiveProject(first.projectId, 1);
    archiveProject(second.projectId, 1);
    expect(countArchivedProjects()).toBe(2);
    expect(listArchivedProjects({ limit: 1, offset: 0 })).toHaveLength(1);
    expect(listArchivedProjects({ limit: 1, offset: 1 })).toHaveLength(1);

    expect(listArchivedEpics()).toHaveLength(0);
    archiveEpic(first.epicId, 1);
    expect(countArchivedEpics()).toBe(1);
    expect(countArchivedEpics(second.projectId)).toBe(0);
    expect(listArchivedEpics({ projectId: first.projectId })).toMatchObject([{ epicId: first.epicId }]);
  });

  it('excludes tombstoned (deleted) Projects and Epics from the archived listing', async () => {
    const env = await setup();
    const { deleteWorkItem, deleteEpic, deleteProject, unlinkRepo, listArchivedProjects, listArchivedEpics } = env;
    const { projectId, epicId, workItemId, repoId } = await seed(env);
    deleteWorkItem(workItemId, 1);
    deleteEpic(epicId, 1);
    unlinkRepo(repoId);
    deleteProject(projectId, 1);
    // A tombstoned entity is never archived-and-not-deleted, so it must not
    // surface as a restorable row — only through the audit trail.
    expect(listArchivedProjects()).toHaveLength(0);
    expect(listArchivedEpics()).toHaveLength(0);
  });

  it('records an audit event per lifecycle mutation and returns them most-recent-first', async () => {
    const env = await setup();
    const { archiveWorkItem, restoreArchivedWorkItem, listAuditEvents } = env;
    const { workItemId } = await seed(env);
    archiveWorkItem(workItemId, 1, { audit: { actor: 'web', requestId: 'req-archive' } });
    restoreArchivedWorkItem(workItemId, 2, { audit: { actor: 'web', requestId: 'req-restore' } });

    const events = listAuditEvents('work_item', workItemId);
    expect(events.map((event) => event.action)).toEqual(['restoreArchive', 'archive', 'create']);
    expect(events[0]?.requestId).toBe('req-restore');
    expect(events.every((event) => event.entityId === workItemId && event.entityKind === 'work_item')).toBe(true);
  });
});
