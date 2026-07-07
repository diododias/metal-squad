import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockResolveRepo = vi.fn();
const mockRegisterRepo = vi.fn();
const mockLoadBacklog = vi.fn();
const mockExecuteBacklog = vi.fn();
const mockValidateBacklogSkills = vi.fn();
const mockLoadConfig = vi.fn();
const mockCreateSkillRegistry = vi.fn();
const mockFormatSkillList = vi.fn();
const mockListRuns = vi.fn();
const mockCleanupStaleRuns = vi.fn();
const mockRender = vi.fn();
const mockAssertWritableDbPath = vi.fn();

vi.mock('../../src/core/repo.js', () => ({
  resolveRepo: mockResolveRepo,
}));

vi.mock('../../src/db/repo.js', () => ({
  registerRepo: mockRegisterRepo,
  listRuns: mockListRuns,
  cleanupStaleRuns: mockCleanupStaleRuns,
}));

vi.mock('../../src/core/backlog/load.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/backlog/load.js')>('../../src/core/backlog/load.js');
  return {
    ...actual,
    loadBacklog: mockLoadBacklog,
  };
});

vi.mock('../../src/core/runner/execute.js', () => ({
  executeBacklog: mockExecuteBacklog,
}));

vi.mock('../../src/core/skills/index.js', () => ({
  validateBacklogSkills: mockValidateBacklogSkills,
  createSkillRegistry: mockCreateSkillRegistry,
  formatSkillList: mockFormatSkillList,
}));

vi.mock('../../src/config/index.js', () => ({
  loadConfig: mockLoadConfig,
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

vi.mock('ink', () => ({
  render: mockRender,
}));

describe('commands', () => {
  const previousCwd = process.cwd();
  let cwd = '';
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const table = vi.spyOn(console, 'table').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    cwd = mkdtempSync(join(tmpdir(), 'msq-command-'));
    process.chdir(cwd);
    mockResolveRepo.mockReturnValue({ repoId: 'repo-1', path: cwd });
    mockLoadConfig.mockReturnValue({
      concurrency: 3,
      staleRunThresholdMinutes: 120,
      workflow: { autoAdvanceStages: false, pollIntervalMs: 2_000 },
    });
    mockCreateSkillRegistry.mockReturnValue({ discover: vi.fn(() => ['implement']) });
    mockFormatSkillList.mockReturnValue('implement');
    mockAssertWritableDbPath.mockReturnValue(undefined);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    if (cwd) rmSync(cwd, { recursive: true, force: true });
  });

  it('init creates backlog.yaml and registers the repo', async () => {
    const { registerInit } = await import('../../src/commands/init.js');
    const program = new Command();
    registerInit(program);

    await program.parseAsync(['node', 'msq', 'init']);

    expect(existsSync(join(cwd, 'backlog.yaml'))).toBe(true);
    expect(readFileSync(join(cwd, 'backlog.yaml'), 'utf8')).toContain(`repo: ${cwd.split('/').pop()}`);
    expect(mockRegisterRepo).toHaveBeenCalledWith('repo-1', cwd);
    expect(log).toHaveBeenCalledWith('Created backlog.yaml');
  });

  it('init does not overwrite an existing backlog', async () => {
    const backlogPath = join(cwd, 'backlog.yaml');
    const original = 'version: 2\nrepo: keep\n';
    await import('node:fs').then(({ writeFileSync }) => writeFileSync(backlogPath, original));

    const { registerInit } = await import('../../src/commands/init.js');
    const program = new Command();
    registerInit(program);

    await program.parseAsync(['node', 'msq', 'init']);

    expect(readFileSync(backlogPath, 'utf8')).toBe(original);
    expect(log).toHaveBeenCalledWith('backlog.yaml already exists — nothing to do.');
  });

  it('run validates skills and uses explicit concurrency', async () => {
    const backlog = { version: 2, repo: 'demo', defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] }, epics: [] };
    mockLoadBacklog.mockReturnValue(backlog);
    const { registerRun } = await import('../../src/commands/run.js');
    const program = new Command();
    registerRun(program);
    const currentCwd = process.cwd();

    await program.parseAsync(['node', 'msq', 'run', '--feature', 'feat-1', '--concurrency', '9']);

    expect(mockAssertWritableDbPath).toHaveBeenCalled();
    expect(mockLoadBacklog).toHaveBeenCalledWith(undefined, currentCwd);
    expect(mockValidateBacklogSkills).toHaveBeenCalledWith(backlog, currentCwd);
    expect(mockExecuteBacklog).toHaveBeenCalledWith(backlog, {
      cwd: currentCwd,
      concurrency: 9,
      featureId: 'feat-1',
      autoAdvanceStages: false,
    });
  });

  it('run falls back to config concurrency', async () => {
    mockLoadBacklog.mockReturnValue({ version: 2, repo: 'demo', defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] }, epics: [] });
    const { registerRun } = await import('../../src/commands/run.js');
    const program = new Command();
    registerRun(program);
    const currentCwd = process.cwd();

    await program.parseAsync(['node', 'msq', 'run']);

    expect(mockAssertWritableDbPath).toHaveBeenCalled();
    expect(mockExecuteBacklog).toHaveBeenCalledWith(
      { version: 2, repo: 'demo', defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] }, epics: [] },
      {
        cwd: currentCwd,
        concurrency: 3,
        featureId: undefined,
        autoAdvanceStages: false,
      },
    );
  });

  it('run surfaces a db path error before spawning adapters', async () => {
    const backlog = { version: 2, repo: 'demo', defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] }, epics: [] };
    mockLoadBacklog.mockReturnValue(backlog);

    const { DbAccessError } = await import('../../src/db/index.js');
    mockAssertWritableDbPath.mockImplementation(() => {
      throw new DbAccessError('Banco SQLite sem escrita em: /tmp/app.db');
    });

    const { registerRun } = await import('../../src/commands/run.js');
    const program = new Command();
    registerRun(program);

    await expect(
      program.parseAsync(['node', 'msq', 'run']),
    ).rejects.toThrow(
      'No adapter was executed because run persistence failed before the first spawn.',
    );

    expect(mockLoadBacklog).not.toHaveBeenCalled();
    expect(mockExecuteBacklog).not.toHaveBeenCalled();
  });

  it('skills lists discovered skills', async () => {
    const { registerSkills } = await import('../../src/commands/skills.js');
    const program = new Command();
    registerSkills(program);

    await program.parseAsync(['node', 'msq', 'skills']);

    expect(mockFormatSkillList).toHaveBeenCalledWith(['implement']);
    expect(log).toHaveBeenCalledWith('implement');
  });

  it('status reports empty state and repaired stale runs', async () => {
    const { registerStatus } = await import('../../src/commands/status.js');
    const program = new Command();
    registerStatus(program);

    mockListRuns.mockReturnValueOnce([]);
    await program.parseAsync(['node', 'msq', 'status']);
    expect(log).toHaveBeenCalledWith('No runs recorded.');

    mockCleanupStaleRuns.mockReturnValue(2);
    mockListRuns.mockReturnValueOnce([
      {
        id: 1,
        feature_id: 'feat-1',
        tool: 'codex',
        status: 'done',
        total: 100,
        started_at: '2026-07-06T10:00:00Z',
        summary: 'summary',
      },
    ]);
    await program.parseAsync(['node', 'msq', 'status', '--repair-stale', '--stale-minutes', '30', '--limit', '10']);

    expect(mockCleanupStaleRuns).toHaveBeenCalledWith(30);
    expect(table).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      '[msq] 2 orphan run(s) marked as failed (30 min threshold).',
    );
  });

  it('ui dynamically imports and renders the app', async () => {
    const { registerUi } = await import('../../src/commands/ui.js');
    const program = new Command();
    registerUi(program);

    await program.parseAsync(['node', 'msq', 'ui']);

    expect(mockRender).toHaveBeenCalledTimes(1);
  });
});
