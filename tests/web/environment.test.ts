import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accessSync: vi.fn(),
  assertWritableDbPath: vi.fn(),
  resolveDbPath: vi.fn(),
  resolveRepo: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  accessSync: mocks.accessSync,
}));

vi.mock('../../src/config/index.js', () => ({
  CONFIG_DIR: '/config/metal-squad',
  DATA_DIR: '/data/metal-squad',
  DB_PATH_ENV: 'MSQ_DB_PATH',
  resolveDbPath: mocks.resolveDbPath,
}));

vi.mock('../../src/core/repo.js', () => ({
  resolveRepo: mocks.resolveRepo,
}));

vi.mock('../../src/db/index.js', () => ({
  assertWritableDbPath: mocks.assertWritableDbPath,
}));

describe('collectEnvironmentInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MSQ_DB_PATH;
    mocks.resolveDbPath.mockReturnValue('/data/metal-squad/app.db');
    mocks.resolveRepo.mockReturnValue({ path: '/repo/metal-squad', repoId: 'repo-123' });
  });

  it('collects default paths, writability, repository identity, and version read-only', async () => {
    const { collectEnvironmentInfo } = await import('../../src/web/environment.js');

    expect(collectEnvironmentInfo('/repo/metal-squad')).toMatchObject({
      databasePath: '/data/metal-squad/app.db',
      databaseSource: 'default',
      dbWritable: true,
      dataDir: '/data/metal-squad',
      configDir: '/config/metal-squad',
      configWritable: true,
      repoPath: '/repo/metal-squad',
      repoId: 'repo-123',
      version: '0.0.1',
    });
    expect(mocks.assertWritableDbPath).toHaveBeenCalledWith('/data/metal-squad/app.db', { createDataDir: false });
  });

  it('reports an override and inaccessible database or config directories without throwing', async () => {
    process.env.MSQ_DB_PATH = '/readonly/app.db';
    mocks.resolveDbPath.mockReturnValue('/readonly/app.db');
    mocks.assertWritableDbPath.mockImplementation(() => {
      throw new Error('readonly');
    });
    mocks.accessSync.mockImplementation(() => {
      throw new Error('readonly');
    });
    const { collectEnvironmentInfo } = await import('../../src/web/environment.js');

    expect(collectEnvironmentInfo()).toMatchObject({
      databasePath: '/readonly/app.db',
      databaseSource: 'override',
      dbWritable: false,
      configWritable: false,
    });
  });

  it('degrades repository fields when repository resolution fails', async () => {
    mocks.resolveRepo.mockImplementation(() => {
      throw new Error('not a repository');
    });
    const { collectEnvironmentInfo } = await import('../../src/web/environment.js');

    expect(collectEnvironmentInfo()).toMatchObject({ repoPath: undefined, repoId: undefined });
  });
});
