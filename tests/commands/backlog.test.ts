import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const mockResolveRepo = vi.fn();
const mockRegisterRepo = vi.fn();
const mockLoadBacklog = vi.fn();
const mockAssertWritableDbPath = vi.fn();
const mockDiffBacklogCatalog = vi.fn();
const mockUpsertBacklogCatalog = vi.fn();

vi.mock('../../src/core/repo.js', () => ({
  resolveRepo: mockResolveRepo,
}));

vi.mock('../../src/core/backlog/load.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/backlog/load.js')>('../../src/core/backlog/load.js');
  return {
    ...actual,
    loadBacklog: mockLoadBacklog,
  };
});

vi.mock('../../src/db/repo.js', () => ({
  registerRepo: mockRegisterRepo,
}));

vi.mock('../../src/db/index.js', () => ({
  assertWritableDbPath: mockAssertWritableDbPath,
  DbAccessError: class DbAccessError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'DbAccessError';
    }
  },
}));

vi.mock('../../src/db/backlogCatalog.js', () => ({
  diffBacklogCatalog: mockDiffBacklogCatalog,
  upsertBacklogCatalog: mockUpsertBacklogCatalog,
}));

describe('backlog load command', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const backlog = {
    version: 2,
    repo: 'demo',
    defaults: { tool: 'claude', effort: 'medium', skills: [], stageSkills: {} },
    epics: [{ id: 'epic-1', title: 'Epic', features: [{ id: 'feat-1' }] }],
  };
  const diff = { addedFeatures: ['feat-1'], changedFeatures: [], archivedFeatures: [], unchangedFeatures: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveRepo.mockReturnValue({ repoId: 'repo-1', path: '/repo' });
    mockLoadBacklog.mockReturnValue(backlog);
    mockAssertWritableDbPath.mockReturnValue(undefined);
    mockDiffBacklogCatalog.mockReturnValue(diff);
    mockUpsertBacklogCatalog.mockReturnValue(diff);
  });

  afterEach(() => {
    log.mockClear();
  });

  it('dry-run computes and prints the diff without writing to the db', async () => {
    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await program.parseAsync(['node', 'msq', 'backlog', 'load', '--dry-run']);

    expect(mockLoadBacklog).toHaveBeenCalledWith(undefined, process.cwd());
    expect(mockDiffBacklogCatalog).toHaveBeenCalledWith(backlog, 'repo-1');
    expect(mockAssertWritableDbPath).not.toHaveBeenCalled();
    expect(mockRegisterRepo).not.toHaveBeenCalled();
    expect(mockUpsertBacklogCatalog).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
  });

  it('load writes the catalog and prints a summary', async () => {
    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await program.parseAsync(['node', 'msq', 'backlog', 'load']);

    expect(mockAssertWritableDbPath).toHaveBeenCalled();
    expect(mockRegisterRepo).toHaveBeenCalledWith('repo-1', '/repo');
    expect(mockUpsertBacklogCatalog).toHaveBeenCalledWith(backlog, 'repo-1');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Catalogo atualizado'));
  });

  it('passes --file through to the YAML loader', async () => {
    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await program.parseAsync(['node', 'msq', 'backlog', 'load', '--file', 'other.yaml']);

    expect(mockLoadBacklog).toHaveBeenCalledWith('other.yaml', process.cwd());
  });

  it('surfaces a db access error without swallowing it silently', async () => {
    const { DbAccessError } = await import('../../src/db/index.js');
    mockAssertWritableDbPath.mockImplementation(() => {
      throw new DbAccessError('Banco SQLite sem escrita em: /tmp/app.db');
    });

    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await expect(
      program.parseAsync(['node', 'msq', 'backlog', 'load']),
    ).rejects.toThrow('Catalogo nao foi atualizado.');
    expect(mockUpsertBacklogCatalog).not.toHaveBeenCalled();
  });

  it('propagates YAML validation errors as-is', async () => {
    mockLoadBacklog.mockImplementation(() => {
      throw new Error('specFile not found: docs/missing.md');
    });

    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await expect(
      program.parseAsync(['node', 'msq', 'backlog', 'load']),
    ).rejects.toThrow('specFile not found');
    expect(mockUpsertBacklogCatalog).not.toHaveBeenCalled();
  });
});
