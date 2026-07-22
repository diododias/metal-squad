import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const mockResolveRepo = vi.fn();
const mockRegisterRepo = vi.fn();
const mockLoadBacklogWithRegistration = vi.fn();
const mockStageBacklogFile = vi.fn();
const mockPeekBacklogVersion = vi.fn();
const mockAssertWritableDbPath = vi.fn();
const mockPlanBacklogSeed = vi.fn();
const mockApplyBacklogSeed = vi.fn();
const mockPlanBacklogSeedV3 = vi.fn();
const mockApplyBacklogSeedV3 = vi.fn();
const mockGetRegisteredRepo = vi.fn();
const mockExportBacklogV3 = vi.fn();
const mockSerializeBacklogV3 = vi.fn();
const mockWriteBacklogExportFile = vi.fn();

vi.mock('../../src/core/repo.js', () => ({
  resolveRepo: mockResolveRepo,
}));

vi.mock('../../src/core/backlog/load.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/backlog/load.js')>('../../src/core/backlog/load.js');
  return {
    ...actual,
    loadBacklogWithRegistration: mockLoadBacklogWithRegistration,
    stageBacklogFile: mockStageBacklogFile,
    peekBacklogVersion: mockPeekBacklogVersion,
  };
});

vi.mock('../../src/db/repo.js', () => ({
  registerRepo: mockRegisterRepo,
  getRegisteredRepo: mockGetRegisteredRepo,
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
  planBacklogSeed: mockPlanBacklogSeed,
  applyBacklogSeed: mockApplyBacklogSeed,
  planBacklogSeedV3: mockPlanBacklogSeedV3,
  applyBacklogSeedV3: mockApplyBacklogSeedV3,
}));

vi.mock('../../src/core/backlog/export.js', () => ({
  exportBacklogV3: mockExportBacklogV3,
  serializeBacklogV3: mockSerializeBacklogV3,
  writeBacklogExportFile: mockWriteBacklogExportFile,
}));

const log = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('backlog load command', () => {
  const backlog = {
    version: 2,
    repo: 'demo',
    defaults: {
      tool: 'claude',
      effort: 'medium',
      thinking: 'off',
      skills: [],
      stageSkills: {},
      workflow: {
        mode: 'staged',
        stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
        approvals: { channel: 'telegram', autoAdvance: false },
        syncTasksToBacklog: true,
        sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
        stepGuidance: {},
      },
    },
    epics: [{ id: 'epic-1', title: 'Epic', features: [{ id: 'feat-1' }] }],
  };
  const loaded = { backlog, registrations: [] };
  const plan = { mode: 'seed', repoId: 'repo-1', items: [{ kind: 'feature', id: 'feat-1', status: 'created' }] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveRepo.mockReturnValue({ repoId: 'repo-1', path: '/repo' });
    mockLoadBacklogWithRegistration.mockReturnValue(loaded);
    mockStageBacklogFile.mockReturnValue({ commit: vi.fn(), rollback: vi.fn() });
    mockPeekBacklogVersion.mockReturnValue({ raw: backlog, version: 2 });
    mockAssertWritableDbPath.mockReturnValue(undefined);
    mockPlanBacklogSeed.mockReturnValue(plan);
  });

  afterEach(() => {
    log.mockClear();
  });

  it('dry-run computes and prints the shared seed plan without writing to the db', async () => {
    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await program.parseAsync(['node', 'msq', 'backlog', 'load', '--dry-run']);

    expect(mockLoadBacklogWithRegistration).toHaveBeenCalledWith(undefined, process.cwd());
    expect(mockPlanBacklogSeed).toHaveBeenCalledWith(backlog, 'repo-1');
    expect(mockAssertWritableDbPath).not.toHaveBeenCalled();
    expect(mockRegisterRepo).not.toHaveBeenCalled();
    expect(mockApplyBacklogSeed).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
  });

  it('load writes the catalog and prints a summary', async () => {
    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await program.parseAsync(['node', 'msq', 'backlog', 'load']);

    expect(mockAssertWritableDbPath).toHaveBeenCalled();
    expect(mockRegisterRepo).toHaveBeenCalledWith('repo-1', '/repo');
    expect(mockPlanBacklogSeed).toHaveBeenCalledWith(backlog, 'repo-1');
    expect(mockApplyBacklogSeed).toHaveBeenCalledWith(backlog, plan);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Seed criado'));
  });

  it('passes --file through to the YAML loader', async () => {
    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await program.parseAsync(['node', 'msq', 'backlog', 'load', '--file', 'other.yaml']);

    expect(mockLoadBacklogWithRegistration).toHaveBeenCalledWith('other.yaml', process.cwd());
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
    expect(mockApplyBacklogSeed).not.toHaveBeenCalled();
  });

  it('propagates YAML validation errors as-is', async () => {
    mockLoadBacklogWithRegistration.mockImplementation(() => {
      throw new Error('specFile not found: docs/missing.md');
    });

    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await expect(
      program.parseAsync(['node', 'msq', 'backlog', 'load']),
    ).rejects.toThrow('specFile not found');
    expect(mockApplyBacklogSeed).not.toHaveBeenCalled();
  });

  it('prints the exact seed plan as JSON in dry-run', async () => {
    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await program.parseAsync(['node', 'msq', 'backlog', 'load', '--dry-run', '--format', 'json']);

    expect(JSON.parse(log.mock.calls.at(-1)?.[0] as string)).toEqual(plan);
    expect(mockApplyBacklogSeed).not.toHaveBeenCalled();
  });

  describe('v3 asset routing', () => {
    const v3Asset = {
      version: 3,
      project: { id: 'proj-1', name: 'Proj', position: 0 },
      repositories: [{ repoId: 'repo-1', label: 'my-repo' }],
      epics: [],
      workItems: [],
    };
    const v3Plan = { mode: 'seed-v3', projectId: 'proj-1', repoPaths: { 'repo-1': '/repo' }, items: [{ kind: 'catalog', id: 'proj-1', status: 'created' }] };

    beforeEach(() => {
      mockPeekBacklogVersion.mockReturnValue({ raw: v3Asset, version: 3 });
      mockGetRegisteredRepo.mockReturnValue({ repoId: 'repo-1', path: '/repo' });
      mockPlanBacklogSeedV3.mockReturnValue(v3Plan);
    });

    it('routes a v3 asset to the v3 seed plan/apply pair instead of the v2 path', async () => {
      const { registerBacklog } = await import('../../src/commands/backlog.js');
      const program = new Command();
      registerBacklog(program);

      await program.parseAsync(['node', 'msq', 'backlog', 'load']);

      expect(mockLoadBacklogWithRegistration).not.toHaveBeenCalled();
      expect(mockPlanBacklogSeedV3).toHaveBeenCalledWith(v3Asset, 'proj-1', { 'repo-1': '/repo' });
      expect(mockApplyBacklogSeedV3).toHaveBeenCalledWith(v3Asset, v3Plan);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Seed criado'));
    });

    it('dry-run for a v3 asset never applies the plan', async () => {
      const { registerBacklog } = await import('../../src/commands/backlog.js');
      const program = new Command();
      registerBacklog(program);

      await program.parseAsync(['node', 'msq', 'backlog', 'load', '--dry-run']);

      expect(mockPlanBacklogSeedV3).toHaveBeenCalled();
      expect(mockApplyBacklogSeedV3).not.toHaveBeenCalled();
    });

    it('resolves an unregistered repo through an explicit --repo-map entry', async () => {
      mockGetRegisteredRepo.mockReturnValue(null);
      const { registerBacklog } = await import('../../src/commands/backlog.js');
      const program = new Command();
      registerBacklog(program);

      await program.parseAsync(['node', 'msq', 'backlog', 'load', '--repo-map', 'repo-1=/mapped/path']);

      expect(mockPlanBacklogSeedV3).toHaveBeenCalledWith(v3Asset, 'proj-1', { 'repo-1': '/mapped/path' });
    });

    it('omits a repo from repoPaths when neither registered nor explicitly mapped', async () => {
      mockGetRegisteredRepo.mockReturnValue(null);
      const { registerBacklog } = await import('../../src/commands/backlog.js');
      const program = new Command();
      registerBacklog(program);

      await program.parseAsync(['node', 'msq', 'backlog', 'load']);

      expect(mockPlanBacklogSeedV3).toHaveBeenCalledWith(v3Asset, 'proj-1', {});
    });

    it('--project overrides the target Project id from the asset', async () => {
      const { registerBacklog } = await import('../../src/commands/backlog.js');
      const program = new Command();
      registerBacklog(program);

      await program.parseAsync(['node', 'msq', 'backlog', 'load', '--project', 'other-project']);

      expect(mockPlanBacklogSeedV3).toHaveBeenCalledWith(v3Asset, 'other-project', { 'repo-1': '/repo' });
    });
  });
});

describe('backlog export command', () => {
  const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const asset = { version: 3 as const, project: { id: 'proj-1', name: 'Proj', position: 0 }, repositories: [], epics: [], workItems: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExportBacklogV3.mockReturnValue(asset);
    mockSerializeBacklogV3.mockReturnValue('version: 3\n');
  });

  afterEach(() => {
    log.mockClear();
    stdoutWrite.mockClear();
  });

  it('writes the serialized asset to stdout by default', async () => {
    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await program.parseAsync(['node', 'msq', 'backlog', 'export', '--project', 'proj-1']);

    expect(mockExportBacklogV3).toHaveBeenCalledWith('proj-1', { includeArchived: false, includePaths: false });
    expect(mockSerializeBacklogV3).toHaveBeenCalledWith(asset, 'yaml');
    expect(stdoutWrite).toHaveBeenCalledWith('version: 3\n');
    expect(mockWriteBacklogExportFile).not.toHaveBeenCalled();
  });

  it('writes to a file when --file is provided', async () => {
    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await program.parseAsync(['node', 'msq', 'backlog', 'export', '--project', 'proj-1', '--file', 'out.yaml']);

    expect(mockWriteBacklogExportFile).toHaveBeenCalledWith('out.yaml', 'version: 3\n');
    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it('passes includeArchived and includePaths flags through', async () => {
    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await program.parseAsync(['node', 'msq', 'backlog', 'export', '--project', 'proj-1', '--include-archived', '--include-paths']);

    expect(mockExportBacklogV3).toHaveBeenCalledWith('proj-1', { includeArchived: true, includePaths: true });
  });

  it('rejects an unsupported format', async () => {
    const { registerBacklog } = await import('../../src/commands/backlog.js');
    const program = new Command();
    registerBacklog(program);

    await expect(
      program.parseAsync(['node', 'msq', 'backlog', 'export', '--project', 'proj-1', '--format', 'xml']),
    ).rejects.toThrow(/Unsupported export format/);
  });
});
