import { chmodSync, closeSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

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
