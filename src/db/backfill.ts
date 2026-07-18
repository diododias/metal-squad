import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import { resolveDbPath } from '../config/index.js';

export class BackfillIntegrityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BackfillIntegrityError';
  }
}

export interface BackfillProjectsResult {
  backupPath: string | null;
  projectsCreated: number;
  reposLinked: number;
  epicsBackfilled: number;
  runsBackfilled: number;
  pipelinesBackfilled: number;
}

/**
 * Migrates every registered repo (including empty ones) to an implicit
 * Project, fills project_id snapshots on epics/runs/pipelines, and rebuilds
 * backlog_epics so project_id becomes NOT NULL while repo_id turns legacy
 * (nullable). Idempotent: repos already linked in project_repos are skipped
 * and a second run makes no further writes.
 */
export function backfillProjects(db: Database.Database): BackfillProjectsResult {
  const backupPath = createVerifiedBackup(db);

  const result: BackfillProjectsResult = {
    backupPath,
    projectsCreated: 0,
    reposLinked: 0,
    epicsBackfilled: 0,
    runsBackfilled: 0,
    pipelinesBackfilled: 0,
  };

  const run = db.transaction(() => {
    linkReposToImplicitProjects(db, result);
    backfillEpicProjectIds(db, result);
    backfillSnapshotProjectIds(db, result);
    rebuildBacklogEpicsTable(db);

    const fkViolations = db.pragma('foreign_key_check') as unknown[];
    if (fkViolations.length > 0) {
      throw new BackfillIntegrityError(
        `Backfill aborted: foreign_key_check found ${String(fkViolations.length)} violation(s) after rebuild.`,
      );
    }
    const integrity = db.pragma('integrity_check') as { integrity_check: string }[];
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
      throw new BackfillIntegrityError(
        `Backfill aborted: integrity_check failed after rebuild: ${JSON.stringify(integrity)}`,
      );
    }
  });

  run();
  return result;
}

function createVerifiedBackup(db: Database.Database): string | null {
  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) return null;

  const backupPath = `${dbPath}.bak`;
  if (existsSync(backupPath)) rmSync(backupPath);
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);

  const backupDb = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    const integrity = backupDb.pragma('integrity_check') as { integrity_check: string }[];
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
      throw new BackfillIntegrityError(
        `Backup verification failed at ${backupPath}: ${JSON.stringify(integrity)}`,
      );
    }
  } finally {
    backupDb.close();
  }
  return backupPath;
}

function linkReposToImplicitProjects(db: Database.Database, result: BackfillProjectsResult): void {
  const repos = db.prepare(`SELECT repo_id, path FROM repos`).all() as { repo_id: string; path: string }[];
  const linked = new Set(
    (db.prepare(`SELECT repo_id FROM project_repos`).all() as { repo_id: string }[]).map((row) => row.repo_id),
  );

  const insertProject = db.prepare(
    `INSERT INTO projects (project_id, name, position) VALUES (?, ?, ?)`,
  );
  const insertProjectRepo = db.prepare(
    `INSERT INTO project_repos (repo_id, project_id, position) VALUES (?, ?, 0)`,
  );
  const getCatalogName = db.prepare(
    `SELECT repo FROM backlog_catalog_meta WHERE repo_id = ?`,
  );

  let position = (db.prepare(`SELECT COALESCE(MAX(position), -1) AS maxPos FROM projects`).get() as { maxPos: number }).maxPos + 1;

  for (const repo of repos) {
    if (linked.has(repo.repo_id)) continue;

    const catalogMeta = getCatalogName.get(repo.repo_id) as { repo: string } | undefined;
    const name = implicitProjectName(catalogMeta?.repo, repo.path, repo.repo_id);

    const projectId = randomUUID();
    insertProject.run(projectId, name, position);
    insertProjectRepo.run(repo.repo_id, projectId);
    position += 1;

    result.projectsCreated += 1;
    result.reposLinked += 1;
  }
}

function backfillEpicProjectIds(db: Database.Database, result: BackfillProjectsResult): void {
  const orphans = db
    .prepare(
      `SELECT e.epic_id AS epicId, e.repo_id AS repoId
       FROM backlog_epics e
       LEFT JOIN repos r ON r.repo_id = e.repo_id
       WHERE e.project_id IS NULL AND r.repo_id IS NULL`,
    )
    .all() as { epicId: string; repoId: string }[];

  if (orphans.length > 0) {
    const details = orphans.map((o) => `epic "${o.epicId}" -> repo "${o.repoId}"`).join(', ');
    throw new BackfillIntegrityError(
      `Backfill aborted: found ${String(orphans.length)} epic(s) referencing a repo that no longer exists: ${details}`,
    );
  }

  const info = db
    .prepare(
      `UPDATE backlog_epics
       SET project_id = (
         SELECT pr.project_id FROM project_repos pr WHERE pr.repo_id = backlog_epics.repo_id
       )
       WHERE project_id IS NULL`,
    )
    .run();
  result.epicsBackfilled = info.changes;
}

function backfillSnapshotProjectIds(db: Database.Database, result: BackfillProjectsResult): void {
  const runsInfo = db
    .prepare(
      `UPDATE runs
       SET project_id = (
         SELECT pr.project_id FROM project_repos pr WHERE pr.repo_id = runs.repo_id
       )
       WHERE project_id IS NULL`,
    )
    .run();
  result.runsBackfilled = runsInfo.changes;

  const pipelinesInfo = db
    .prepare(
      `UPDATE pipelines
       SET project_id = (
         SELECT pr.project_id FROM project_repos pr WHERE pr.repo_id = pipelines.repo_id
       )
       WHERE project_id IS NULL`,
    )
    .run();
  result.pipelinesBackfilled = pipelinesInfo.changes;
}

function rebuildBacklogEpicsTable(db: Database.Database): void {
  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE backlog_epics_new (
      epic_id     TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(project_id),
      repo_id     TEXT REFERENCES repos(repo_id),
      title       TEXT NOT NULL,
      description TEXT,
      status      TEXT,
      position    INTEGER NOT NULL,
      data_json   TEXT NOT NULL,
      archived_at TEXT,
      deleted_at  TEXT,
      revision    INTEGER NOT NULL DEFAULT 1,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO backlog_epics_new (
      epic_id, project_id, repo_id, title, description, status,
      position, data_json, archived_at, deleted_at, revision, updated_at
    )
    SELECT
      epic_id, project_id, repo_id, title, description, status,
      position, data_json, archived_at, deleted_at, revision, updated_at
    FROM backlog_epics;

    DROP TABLE backlog_epics;
    ALTER TABLE backlog_epics_new RENAME TO backlog_epics;

    CREATE INDEX IF NOT EXISTS idx_backlog_epics_project ON backlog_epics(project_id);
    CREATE INDEX IF NOT EXISTS idx_backlog_epics_deleted_at ON backlog_epics(deleted_at);
  `);

  db.pragma('foreign_keys = ON');
}

function implicitProjectName(catalogRepoName: string | undefined, repoPath: string, repoId: string): string {
  if (catalogRepoName) return catalogRepoName;
  const fromPath = basename(repoPath);
  return fromPath || repoId;
}
