import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrepareAll = vi.fn(() => []);
const mockPrepare = vi.fn(() => ({ all: mockPrepareAll, run: vi.fn(), get: vi.fn() }));
const mockPragma = vi.fn();
const mockExec = vi.fn();
const mockClose = vi.fn();
const mockDb = { prepare: mockPrepare, pragma: mockPragma, exec: mockExec, close: mockClose };
const mockDatabase = vi.fn(() => mockDb);

const mockEnsureDataDir = vi.fn();
const mockResolveDbPath = vi.fn(() => ':memory:');
const mockAccessSync = vi.fn();
const mockExistsSync = vi.fn(() => false);

vi.mock('better-sqlite3', () => ({ default: mockDatabase }));
vi.mock('../../src/config/index.js', () => ({
  DB_PATH_ENV: 'MSQ_DB_PATH',
  resolveDbPath: mockResolveDbPath,
  ensureDataDir: mockEnsureDataDir,
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    accessSync: mockAccessSync,
    existsSync: mockExistsSync,
  };
});

beforeEach(() => {
  vi.resetModules();
  mockDatabase.mockReset();
  mockDatabase.mockReturnValue(mockDb);
  mockPrepare.mockReset();
  mockPragma.mockReset();
  mockExec.mockReset();
  mockClose.mockReset();
  mockEnsureDataDir.mockReset();
  mockAccessSync.mockReset(); // reset clears both calls AND implementation
  mockExistsSync.mockReset();
  mockExistsSync.mockReturnValue(false);
  mockResolveDbPath.mockReturnValue(':memory:');
  mockPrepareAll.mockReset();
  mockPrepareAll.mockReturnValue([]);
  mockPrepare.mockImplementation(() => ({ all: mockPrepareAll, run: vi.fn(), get: vi.fn() }));
});

describe('DbAccessError', () => {
  it('has name DbAccessError', async () => {
    const { DbAccessError } = await import('../../src/db/index.js');
    const err = new DbAccessError('/path/to/db', 'detail msg');
    expect(err.name).toBe('DbAccessError');
  });

  it('includes dbPath in message', async () => {
    const { DbAccessError } = await import('../../src/db/index.js');
    const err = new DbAccessError('/my/db.sqlite', 'some detail');
    expect(err.message).toContain('/my/db.sqlite');
  });

  it('includes detail in message', async () => {
    const { DbAccessError } = await import('../../src/db/index.js');
    const err = new DbAccessError('/db', 'file locked');
    expect(err.message).toContain('file locked');
  });

  it('stores dbPath as property', async () => {
    const { DbAccessError } = await import('../../src/db/index.js');
    const err = new DbAccessError('/custom/path.db', 'detail');
    expect(err.dbPath).toBe('/custom/path.db');
  });

  it('is an instance of Error', async () => {
    const { DbAccessError } = await import('../../src/db/index.js');
    const err = new DbAccessError('/db', 'detail');
    expect(err instanceof Error).toBe(true);
  });

  it('message includes MSQ_DB_PATH env hint', async () => {
    const { DbAccessError } = await import('../../src/db/index.js');
    const err = new DbAccessError('/db', 'detail');
    expect(err.message).toContain('MSQ_DB_PATH');
  });
});

describe('assertWritableDbPath', () => {
  it('calls ensureDataDir', async () => {
    const { assertWritableDbPath } = await import('../../src/db/index.js');
    assertWritableDbPath(':memory:');
    expect(mockEnsureDataDir).toHaveBeenCalledWith(':memory:');
  });

  it('throws DbAccessError when ensureDataDir throws', async () => {
    mockEnsureDataDir.mockImplementation(() => { throw new Error('mkdir failed'); });
    const { assertWritableDbPath, DbAccessError } = await import('../../src/db/index.js');
    expect(() => assertWritableDbPath('/no/access.db')).toThrow(DbAccessError);
  });

  it('throws DbAccessError when directory not writable', async () => {
    mockAccessSync.mockImplementation(() => { throw new Error('EACCES'); });
    const { assertWritableDbPath, DbAccessError } = await import('../../src/db/index.js');
    expect(() => assertWritableDbPath('/locked/db.sqlite')).toThrow(DbAccessError);
  });

  it('throws DbAccessError when db file not writable', async () => {
    // ensureDataDir succeeds, dir access succeeds, but file exists and is not writable
    mockExistsSync.mockReturnValue(true);
    let callCount = 0;
    mockAccessSync.mockImplementation(() => {
      callCount++;
      if (callCount === 2) throw new Error('EACCES file'); // Second call is file check
    });
    const { assertWritableDbPath, DbAccessError } = await import('../../src/db/index.js');
    expect(() => assertWritableDbPath('/locked/db.sqlite')).toThrow(DbAccessError);
  });

  it('does not throw when file does not exist yet', async () => {
    mockExistsSync.mockReturnValue(false);
    const { assertWritableDbPath } = await import('../../src/db/index.js');
    expect(() => assertWritableDbPath(':memory:')).not.toThrow();
  });
});

describe('getDb', () => {
  it('creates a new database instance', async () => {
    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');
    expect(mockDatabase).toHaveBeenCalledWith(':memory:');
  });

  it('returns the same instance on repeated readwrite calls', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const db1 = getDb('readwrite');
    const db2 = getDb('readwrite');
    expect(db1).toBe(db2);
    expect(mockDatabase).toHaveBeenCalledTimes(1);
  });

  it('calls pragma and migrate on readwrite', async () => {
    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');
    expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL');
    expect(mockPragma).toHaveBeenCalledWith('foreign_keys = ON');
    expect(mockExec).toHaveBeenCalled();
  });

  it('creates readonly connection with fileMustExist', async () => {
    const { getDb } = await import('../../src/db/index.js');
    getDb('readonly');
    expect(mockDatabase).toHaveBeenCalledWith(':memory:', { readonly: true, fileMustExist: true });
  });

  it('defaults to readwrite mode', async () => {
    const { getDb } = await import('../../src/db/index.js');
    getDb();
    expect(mockDatabase).toHaveBeenCalledWith(':memory:');
    expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL');
  });

  it('closes existing connection when switching from readonly to readwrite', async () => {
    const { getDb } = await import('../../src/db/index.js');
    getDb('readonly');
    getDb('readwrite');
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockDatabase).toHaveBeenCalledTimes(2);
  });

  it('reuses readwrite connection for readonly request', async () => {
    const { getDb } = await import('../../src/db/index.js');
    getDb('readwrite');
    getDb('readonly'); // readwrite satisfies readonly
    expect(mockDatabase).toHaveBeenCalledTimes(1);
  });
});

describe('resetDb', () => {
  it('closes the db and resets state', async () => {
    const { getDb, resetDb } = await import('../../src/db/index.js');
    getDb('readwrite');
    resetDb();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing when db is null', async () => {
    const { resetDb } = await import('../../src/db/index.js');
    expect(() => resetDb()).not.toThrow();
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('allows creating new db after reset', async () => {
    const { getDb, resetDb } = await import('../../src/db/index.js');
    getDb('readwrite');
    resetDb();
    getDb('readwrite');
    expect(mockDatabase).toHaveBeenCalledTimes(2);
  });
});
