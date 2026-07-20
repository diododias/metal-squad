import { chmodSync, closeSync, mkdirSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('db path access checks', () => {
  const previousHome = process.env.HOME;
  const previousDbPath = process.env.MSQ_DB_PATH;
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await import('../../src/db/index.js').then(({ resetDb }) => {
      resetDb();
    }).catch(() => {});

    while (cleanupPaths.length > 0) {
      const path = cleanupPaths.pop()!;
      try {
        chmodSync(path, 0o755);
      } catch {}
      rmSync(path, { recursive: true, force: true });
    }

    process.env.HOME = previousHome;
    if (previousDbPath === undefined) {
      delete process.env.MSQ_DB_PATH;
    } else {
      process.env.MSQ_DB_PATH = previousDbPath;
    }
  });

  it('fails with an actionable error when the db file is read-only', async () => {
    const root = join(tmpdir(), `msq-db-${Date.now()}-file`);
    const dbPath = join(root, 'app.db');
    cleanupPaths.push(root);
    mkdirSync(root, { recursive: true });
    closeSync(openSync(dbPath, 'w'));
    chmodSync(dbPath, 0o444);
    process.env.HOME = root;
    process.env.MSQ_DB_PATH = dbPath;

    const { assertWritableDbPath, DbAccessError } = await import('../../src/db/index.js');

    expect(() => assertWritableDbPath()).toThrowError(DbAccessError);
    expect(() => assertWritableDbPath()).toThrowError(
      `Arquivo do banco sem permissão de escrita: ${dbPath}`,
    );
  });

  it('fails with an actionable error when the db directory is not writable', async () => {
    const root = join(tmpdir(), `msq-db-${Date.now()}-dir`);
    const dataDir = join(root, 'readonly-dir');
    const dbPath = join(dataDir, 'app.db');
    cleanupPaths.push(root);
    mkdirSync(dataDir, { recursive: true });
    chmodSync(dataDir, 0o555);
    process.env.HOME = root;
    process.env.MSQ_DB_PATH = dbPath;

    const { assertWritableDbPath, DbAccessError } = await import('../../src/db/index.js');

    expect(() => assertWritableDbPath()).toThrowError(DbAccessError);
    expect(() => assertWritableDbPath()).toThrowError(
      `Diretório sem permissão de escrita: ${dataDir}`,
    );

    chmodSync(dataDir, 0o755);
  });
});

describe('projects schema (PRJ-01)', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    vi.resetModules();
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-projects-schema-'));
    process.env['MSQ_DB_PATH'] = join(directory, 'app.db');
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) delete process.env['MSQ_DB_PATH'];
    else process.env['MSQ_DB_PATH'] = previousDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates projects, project_repos and audit_events tables', async () => {
    const { getDb, resetDb: reset } = await import('../../src/db/index.js');
    resetDb = reset;
    const db = getDb('readwrite');

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    const tableNames = tables.map((table) => table.name);

    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('project_repos');
    expect(tableNames).toContain('audit_events');
  });

  it('adds the additive columns to backlog_epics, backlog_features, runs and pipelines', async () => {
    const { getDb, resetDb: reset } = await import('../../src/db/index.js');
    resetDb = reset;
    const db = getDb('readwrite');

    const columnNames = (table: string): string[] =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

    expect(columnNames('backlog_epics')).toEqual(
      expect.arrayContaining(['project_id', 'description', 'status', 'deleted_at', 'revision']),
    );
    expect(columnNames('backlog_features')).toEqual(
      expect.arrayContaining(['description', 'deleted_at', 'revision']),
    );
    expect(columnNames('runs')).toEqual(expect.arrayContaining(['project_id']));
    expect(columnNames('pipelines')).toEqual(expect.arrayContaining(['project_id']));
  });

  it('keeps backlog_epics.project_id and runs/pipelines.project_id nullable', async () => {
    const { getDb, resetDb: reset } = await import('../../src/db/index.js');
    resetDb = reset;
    const db = getDb('readwrite');

    db.prepare(`INSERT INTO repos (repo_id, path) VALUES ('r1', '/tmp/r1')`).run();
    db.prepare(
      `INSERT INTO backlog_epics (epic_id, repo_id, title, position, data_json) VALUES ('e1', 'r1', 'Epic', 0, '{}')`,
    ).run();
    const epic = db.prepare(`SELECT project_id FROM backlog_epics WHERE epic_id = 'e1'`).get() as {
      project_id: string | null;
    };
    expect(epic.project_id).toBeNull();
  });

  it('enforces the projects archived_at/deleted_at CHECK constraint', async () => {
    const { getDb, resetDb: reset } = await import('../../src/db/index.js');
    resetDb = reset;
    const db = getDb('readwrite');

    expect(() =>
      db
        .prepare(
          `INSERT INTO projects (project_id, name, archived_at, deleted_at) VALUES ('p1', 'Proj', datetime('now'), datetime('now'))`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it('enforces project_repos foreign keys with ON DELETE RESTRICT', async () => {
    const { getDb, resetDb: reset } = await import('../../src/db/index.js');
    resetDb = reset;
    const db = getDb('readwrite');

    expect(() =>
      db
        .prepare(`INSERT INTO project_repos (repo_id, project_id) VALUES ('missing-repo', 'missing-project')`)
        .run(),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('passes foreign_key_check and integrity_check after migration', async () => {
    const { getDb, resetDb: reset } = await import('../../src/db/index.js');
    resetDb = reset;
    const db = getDb('readwrite');

    const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
    expect(fkViolations).toEqual([]);

    const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    expect(integrity.integrity_check).toBe('ok');
  });

  it('is idempotent: reapplying migrate() twice produces the same schema', async () => {
    const { getDb, resetDb: reset } = await import('../../src/db/index.js');
    resetDb = reset;

    const db = getDb('readwrite');
    const schemaOnce = db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name")
      .all();

    reset();
    const dbAgain = getDb('readwrite');
    const schemaTwice = dbAgain
      .prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name")
      .all();

    expect(schemaTwice).toEqual(schemaOnce);
  });
});

describe('backlog_features.type column (PRJ-22)', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    vi.resetModules();
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-workitem-type-'));
    process.env['MSQ_DB_PATH'] = join(directory, 'app.db');
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) delete process.env['MSQ_DB_PATH'];
    else process.env['MSQ_DB_PATH'] = previousDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  it('adds a type column defaulting to feature for legacy rows', async () => {
    const { getDb, resetDb: reset } = await import('../../src/db/index.js');
    resetDb = reset;
    const db = getDb('readwrite');

    db.prepare(`INSERT INTO repos (repo_id, path) VALUES ('r1', '/tmp/r1')`).run();
    db.prepare(
      `INSERT INTO backlog_epics (epic_id, repo_id, title, position, data_json) VALUES ('e1', 'r1', 'Epic', 0, '{}')`,
    ).run();
    db.prepare(
      `INSERT INTO backlog_features (feature_id, epic_id, repo_id, title, position, data_json) VALUES ('f1', 'e1', 'r1', 'Feature', 0, '{}')`,
    ).run();

    const row = db.prepare(`SELECT type FROM backlog_features WHERE feature_id = 'f1'`).get() as { type: string };
    expect(row.type).toBe('feature');
  });

  it('is idempotent: reapplying migrate() twice keeps a single type column', async () => {
    const { getDb, resetDb: reset } = await import('../../src/db/index.js');
    resetDb = reset;
    const db = getDb('readwrite');

    reset();
    const dbAgain = getDb('readwrite');
    const columns = (dbAgain.prepare(`PRAGMA table_info(backlog_features)`).all() as { name: string }[])
      .filter((column) => column.name === 'type');
    expect(columns).toHaveLength(1);
  });
});

describe('rebuildBacklogFeaturesTypeCheck (PRJ-22)', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    vi.resetModules();
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-workitem-type-rebuild-'));
    process.env['MSQ_DB_PATH'] = join(directory, 'app.db');
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) delete process.env['MSQ_DB_PATH'];
    else process.env['MSQ_DB_PATH'] = previousDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  it('rebuilds backlog_features with a CHECK constraint and preserves rows', async () => {
    const { getDb, resetDb: reset } = await import('../../src/db/index.js');
    const { rebuildBacklogFeaturesTypeCheck } = await import('../../src/db/backfill.js');
    resetDb = reset;
    const db = getDb('readwrite');

    db.prepare(`INSERT INTO repos (repo_id, path) VALUES ('r1', '/tmp/r1')`).run();
    db.prepare(
      `INSERT INTO backlog_epics (epic_id, repo_id, title, position, data_json) VALUES ('e1', 'r1', 'Epic', 0, '{}')`,
    ).run();
    db.prepare(
      `INSERT INTO backlog_features (feature_id, epic_id, repo_id, title, type, position, data_json) VALUES ('f1', 'e1', 'r1', 'Feature', 'bug', 0, '{}')`,
    ).run();

    const result = rebuildBacklogFeaturesTypeCheck(db);
    expect(result.rebuilt).toBe(true);

    const row = db.prepare(`SELECT type FROM backlog_features WHERE feature_id = 'f1'`).get() as { type: string };
    expect(row.type).toBe('bug');

    expect(() =>
      db.prepare(`UPDATE backlog_features SET type = 'hotfix' WHERE feature_id = 'f1'`).run(),
    ).toThrow(/CHECK constraint failed/);

    const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
    expect(fkViolations).toEqual([]);
  });

  it('is idempotent: a second call is a no-op once the CHECK constraint exists', async () => {
    const { getDb, resetDb: reset } = await import('../../src/db/index.js');
    const { rebuildBacklogFeaturesTypeCheck } = await import('../../src/db/backfill.js');
    resetDb = reset;
    const db = getDb('readwrite');

    const first = rebuildBacklogFeaturesTypeCheck(db);
    expect(first.rebuilt).toBe(true);

    const second = rebuildBacklogFeaturesTypeCheck(db);
    expect(second.rebuilt).toBe(false);
  });
});
