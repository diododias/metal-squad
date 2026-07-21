import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectLifecycle } from '../../src/core/lifecyclePolicy.js';

/**
 * PRJ-18 projects the lifecycle policy server-side so the web client only reads
 * flags. These tests pin the projection against a real (in-memory) schema —
 * mocking `prepare` here would only assert that the mock was called, not that
 * the policy actually decides correctly.
 */

let db: Database.Database;

/** Minimal slice of the real schema that the policy engine reads. */
function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE projects (
      project_id TEXT PRIMARY KEY,
      archived_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE backlog_epics (
      epic_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      archived_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE backlog_features (
      feature_id TEXT PRIMARY KEY,
      epic_id TEXT NOT NULL,
      depends_on TEXT NOT NULL DEFAULT '[]',
      archived_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE pipelines (pipeline_id INTEGER PRIMARY KEY, feature_id TEXT, status TEXT);
    CREATE TABLE runs (run_id INTEGER PRIMARY KEY, feature_id TEXT, status TEXT);
    CREATE TABLE stage_requests (id INTEGER PRIMARY KEY, feature_id TEXT, status TEXT);
    CREATE TABLE gates (id INTEGER PRIMARY KEY, feature_id TEXT, resolved_at TEXT);
    CREATE TABLE feature_topic_associations (feature_id TEXT PRIMARY KEY);
    CREATE TABLE project_repos (project_id TEXT, repo_id TEXT);
  `);
}

/** A Project → Epic → Work Item chain, pristine unless a test dirties it. */
function seedChain(database: Database.Database): void {
  database.prepare(`INSERT INTO projects (project_id) VALUES ('p1')`).run();
  database.prepare(`INSERT INTO backlog_epics (epic_id, project_id) VALUES ('e1', 'p1')`).run();
  database.prepare(`INSERT INTO backlog_features (feature_id, epic_id) VALUES ('w1', 'e1')`).run();
}

beforeEach(() => {
  db = new Database(':memory:');
  createSchema(db);
  seedChain(db);
});

afterEach(() => {
  db.close();
});

describe('projectLifecycle — Work Item', () => {
  it('offers archive and delete for a pristine item', () => {
    const allowed = projectLifecycle(db, 'work_item', 'w1');
    expect(allowed.state).toBe('pristine');
    expect(allowed.archive).toBe(true);
    expect(allowed.delete).toBe(true);
    expect(allowed.cancel).toBe(false);
    expect(allowed.blockedReason).toBeNull();
  });

  it('offers cancel and no destructive action while running', () => {
    db.prepare(`INSERT INTO runs (feature_id, status) VALUES ('w1', 'running')`).run();
    const allowed = projectLifecycle(db, 'work_item', 'w1');
    expect(allowed.state).toBe('running');
    expect(allowed.cancel).toBe(true);
    expect(allowed.archive).toBe(false);
    expect(allowed.delete).toBe(false);
    expect(allowed.blockedReason).toContain('running');
  });

  it('allows archive but refuses delete once it has run history', () => {
    db.prepare(`INSERT INTO runs (feature_id, status) VALUES ('w1', 'done')`).run();
    const allowed = projectLifecycle(db, 'work_item', 'w1');
    expect(allowed.state).toBe('historical');
    expect(allowed.archive).toBe(true);
    expect(allowed.delete).toBe(false);
    expect(allowed.blockedReason).toContain('history');
  });

  it('refuses delete while a live Work Item depends on it', () => {
    db.prepare(
      `INSERT INTO backlog_features (feature_id, epic_id, depends_on) VALUES ('w2', 'e1', '["w1"]')`,
    ).run();
    const allowed = projectLifecycle(db, 'work_item', 'w1');
    expect(allowed.delete).toBe(false);
    expect(allowed.blockedReason).toContain('w2');
  });

  it('ignores a tombstoned dependent when deciding delete', () => {
    db.prepare(
      `INSERT INTO backlog_features (feature_id, epic_id, depends_on, deleted_at)
       VALUES ('w2', 'e1', '["w1"]', '2026-07-20T00:00:00Z')`,
    ).run();
    expect(projectLifecycle(db, 'work_item', 'w1').delete).toBe(true);
  });

  it('treats an unresolved gate as running', () => {
    db.prepare(`INSERT INTO gates (feature_id, resolved_at) VALUES ('w1', NULL)`).run();
    const allowed = projectLifecycle(db, 'work_item', 'w1');
    expect(allowed.state).toBe('running');
    expect(allowed.cancel).toBe(true);
  });

  it('offers restore for an archived item and nothing for a tombstone', () => {
    db.prepare(`UPDATE backlog_features SET archived_at = '2026-07-20T00:00:00Z' WHERE feature_id = 'w1'`).run();
    const archived = projectLifecycle(db, 'work_item', 'w1');
    expect(archived.archived).toBe(true);
    expect(archived.restore).toBe(true);
    expect(archived.delete).toBe(false);

    db.prepare(`UPDATE backlog_features SET deleted_at = '2026-07-20T00:00:00Z' WHERE feature_id = 'w1'`).run();
    const deleted = projectLifecycle(db, 'work_item', 'w1');
    expect(deleted.deleted).toBe(true);
    expect(deleted.restore).toBe(false);
    expect(deleted.archive).toBe(false);
  });

  it('blocks restore while the parent Epic is archived', () => {
    db.prepare(`UPDATE backlog_features SET archived_at = '2026-07-20T00:00:00Z' WHERE feature_id = 'w1'`).run();
    db.prepare(`UPDATE backlog_epics SET archived_at = '2026-07-20T00:00:00Z' WHERE epic_id = 'e1'`).run();
    const allowed = projectLifecycle(db, 'work_item', 'w1');
    expect(allowed.restore).toBe(false);
    expect(allowed.blockedReason).toContain('ancestor');
  });
});

describe('projectLifecycle — Epic and Project', () => {
  it('refuses Epic delete while a live Work Item survives', () => {
    const allowed = projectLifecycle(db, 'epic', 'e1');
    expect(allowed.delete).toBe(false);
    expect(allowed.blockedReason).toContain('Work Items');
  });

  it('allows Epic delete once every child is tombstoned', () => {
    db.prepare(`UPDATE backlog_features SET deleted_at = '2026-07-20T00:00:00Z' WHERE feature_id = 'w1'`).run();
    expect(projectLifecycle(db, 'epic', 'e1').delete).toBe(true);
  });

  it('propagates a running child up to the Epic and the Project', () => {
    db.prepare(`INSERT INTO runs (feature_id, status) VALUES ('w1', 'running')`).run();
    expect(projectLifecycle(db, 'epic', 'e1').cancel).toBe(true);
    expect(projectLifecycle(db, 'project', 'p1').cancel).toBe(true);
  });

  it('refuses Project delete while repositories are still linked', () => {
    db.prepare(`UPDATE backlog_features SET deleted_at = '2026-07-20T00:00:00Z' WHERE feature_id = 'w1'`).run();
    db.prepare(`UPDATE backlog_epics SET deleted_at = '2026-07-20T00:00:00Z' WHERE epic_id = 'e1'`).run();
    db.prepare(`INSERT INTO project_repos (project_id, repo_id) VALUES ('p1', 'r1')`).run();
    const allowed = projectLifecycle(db, 'project', 'p1');
    expect(allowed.delete).toBe(false);
    expect(allowed.blockedReason).toContain('repositories');
  });
});
