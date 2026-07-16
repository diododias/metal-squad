import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockResolveRepo = vi.fn();
const mockRegisterRepo = vi.fn();
const mockLoadBacklog = vi.fn();
const mockExecuteBacklog = vi.fn();
const mockRehydrateBacklogWorkflowRevisions = vi.fn((backlog) => backlog);
const mockValidateBacklogSkills = vi.fn();
const mockResolveRuntimeConfig = vi.fn();
const mockResolveConfigSnapshot = vi.fn();
const mockCreateSkillRegistry = vi.fn();
const mockFormatSkillList = vi.fn();
const mockListRuns = vi.fn();
const mockListRetryHistory = vi.fn();
const mockGetRunAccumulatedTokens = vi.fn();
const mockListPipelineOverviews = vi.fn();
const mockListResumablePipelines = vi.fn();
const mockFindResumablePipeline = vi.fn();
const mockGetPipelineSnapshot = vi.fn();
const mockCleanupStaleRuns = vi.fn();
const mockRender = vi.fn();
const mockAssertWritableDbPath = vi.fn();
const mockGetAdapter = vi.fn();

vi.mock('../../src/core/repo.js', () => ({
  resolveRepo: mockResolveRepo,
}));

vi.mock('../../src/db/repo.js', () => ({
  registerRepo: mockRegisterRepo,
  findResumablePipeline: mockFindResumablePipeline,
  getPipelineSnapshot: mockGetPipelineSnapshot,
  listRuns: mockListRuns,
  listRetryHistory: mockListRetryHistory,
  getRunAccumulatedTokens: mockGetRunAccumulatedTokens,
  listPipelineOverviews: mockListPipelineOverviews,
  listResumablePipelines: mockListResumablePipelines,
  cleanupStaleRuns: mockCleanupStaleRuns,
}));

vi.mock('../../src/core/backlog/load.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/backlog/load.js')>('../../src/core/backlog/load.js');
  return {
    ...actual,
    loadBacklog: mockLoadBacklog,
    loadBacklogFromCatalog: mockLoadBacklog,
  };
});

vi.mock('../../src/core/runner/execute.js', () => ({
  executeBacklog: mockExecuteBacklog,
  rehydrateBacklogWorkflowRevisions: mockRehydrateBacklogWorkflowRevisions,
}));

vi.mock('../../src/core/skills/index.js', () => ({
  validateBacklogSkills: mockValidateBacklogSkills,
  createSkillRegistry: mockCreateSkillRegistry,
  formatSkillList: mockFormatSkillList,
}));

vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: mockResolveRuntimeConfig,
  resolveConfigSnapshot: mockResolveConfigSnapshot,
  mergeExecutionDefaults: (base: Record<string, unknown>, overlay: Record<string, unknown> = {}) => ({
    ...base,
    ...overlay,
    stageSkills: {
      ...((base.stageSkills as Record<string, string[]>) ?? {}),
      ...((overlay.stageSkills as Record<string, string[]>) ?? {}),
    },
  }),
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
  render: (...args: unknown[]) => {
    mockRender(...args);
    return { waitUntilExit: () => Promise.resolve() };
  },
}));

vi.mock('../../src/core/notify/telegram-poller.js', () => ({
  startTelegramPoller: vi.fn(),
  stopTelegramPoller: vi.fn(),
}));

vi.mock('../../src/core/adapters/index.js', () => ({
  getAdapter: mockGetAdapter,
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
    mockResolveRuntimeConfig.mockReturnValue({
      concurrency: 3,
      staleRunThresholdMinutes: 120,
      toolTimeoutMs: 600_000,
      promptContextCharLimit: 20_000,
      theme: undefined,
      stageSkills: {},
      notifications: { channels: [], events: [] },
      workflow: { autoAdvanceStages: false, pollIntervalMs: 2_000 },
      budget: { alertAtPercent: 80 },
      web: { host: '127.0.0.1', port: 8743, auth: 'token' },
    });
    mockResolveConfigSnapshot.mockReturnValue({
      runtime: {
        concurrency: 3,
        staleRunThresholdMinutes: 120,
        toolTimeoutMs: 600_000,
        promptContextCharLimit: 20_000,
        theme: undefined,
        stageSkills: {},
        notifications: { channels: [], events: [] },
        workflow: { autoAdvanceStages: false, pollIntervalMs: 2_000 },
        budget: { alertAtPercent: 80 },
        web: { host: '127.0.0.1', port: 8743, auth: 'token' },
      },
      repoDefaults: {},
      sources: { globalConfigPath: '/tmp/global.json' },
    });
    mockCreateSkillRegistry.mockReturnValue({ discover: vi.fn(() => ['implement']) });
    mockFormatSkillList.mockReturnValue('implement');
    mockAssertWritableDbPath.mockReturnValue(undefined);
    mockListResumablePipelines.mockReturnValue([]);
    mockListPipelineOverviews.mockReturnValue([]);
    mockListRetryHistory.mockReturnValue([]);
    mockGetRunAccumulatedTokens.mockReturnValue(0);
    mockFindResumablePipeline.mockReturnValue(null);
    mockGetPipelineSnapshot.mockReturnValue({ plan: [], done: [], pending: [], active: [], aborted: [] });
    mockGetAdapter.mockReturnValue({ isAvailable: () => true });
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
    expect(mockLoadBacklog).toHaveBeenCalledWith('repo-1');
    expect(mockValidateBacklogSkills).toHaveBeenCalledWith(backlog, currentCwd);
    expect(mockExecuteBacklog).toHaveBeenCalledWith(backlog, {
      cwd: currentCwd,
      concurrency: 9,
      featureId: 'feat-1',
      autoAdvanceStages: undefined,
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
        autoAdvanceStages: undefined,
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
    mockListPipelineOverviews.mockReturnValueOnce([
      {
        id: 9,
        repoId: 'repo-1',
        featureId: 'feat-12',
        status: 'running',
        currentStage: 'specify',
        activeFeature: 'feat-12',
        pendingFeature: null,
        resumeSummary: '0/1 done · active feat-12',
        pendingStageRequestId: 3,
        pendingStageRequestKind: 'approval',
        pendingStageRequestPrompt: 'Advance to stage plan?',
        createdAt: '2026-07-06T10:00:00Z',
        updatedAt: '2026-07-06T10:01:00Z',
      },
    ]);
    mockListResumablePipelines.mockReturnValueOnce([
      {
        id: 9,
        repoId: 'repo-1',
        featureId: 'feat-12',
        status: 'paused',
        currentStage: 'implement',
        resumeSummary: '1/2 done · next feat-12',
      },
    ]);
    mockGetPipelineSnapshot.mockReturnValueOnce({
      plan: ['feat-11', 'feat-12'],
      done: ['feat-11'],
      pending: ['feat-12'],
      active: [],
      aborted: [],
    });
    mockListRetryHistory.mockReturnValueOnce([
      { attempt: 1, error: 'falha 1', retriedAt: '2026-07-06T10:00:00', tool: null, model: null },
      { attempt: 2, error: 'falha 2', retriedAt: '2026-07-06T10:01:00', tool: 'codex', model: 'gpt-5' },
    ]);
    mockGetRunAccumulatedTokens.mockReturnValueOnce(180);
    await program.parseAsync(['node', 'msq', 'status', '--repair-stale', '--stale-minutes', '30', '--limit', '10']);

    expect(mockCleanupStaleRuns).toHaveBeenCalledWith(30);
    expect(table).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      '[msq] 2 orphan run(s) marked as failed (30 min threshold).',
    );
    expect(log).toHaveBeenCalledWith('Active/pending pipelines:');
    expect(log).toHaveBeenCalledWith('Resumable pipelines:');
    expect(log).toHaveBeenCalledWith('Attempt history (run 1, total tokens: 180):');
    expect(table).toHaveBeenCalledWith([
      { attempt: 1, tool: 'nao registrado', model: 'nao registrado', error: 'falha 1', retried_at: '2026-07-06T10:00:00' },
      { attempt: 2, tool: 'codex', model: 'gpt-5', error: 'falha 2', retried_at: '2026-07-06T10:01:00' },
    ]);
  });

  it('ui dynamically imports and renders the app', async () => {
    const { registerUi } = await import('../../src/commands/ui.js');
    const program = new Command();
    registerUi(program);

    await program.parseAsync(['node', 'msq', 'ui']);

    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  it('resume locates a resumable pipeline and reuses its cwd', async () => {
    const backlog = { version: 2, repo: 'demo', defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] }, epics: [] };
    mockLoadBacklog.mockReturnValue(backlog);
    mockFindResumablePipeline.mockReturnValue({
      id: 9,
      repoId: 'repo-1',
      cwd: '/tmp/resume-repo',
      autoAdvance: 0,
    });
    mockGetPipelineSnapshot.mockReturnValue({
      plan: ['feat-11', 'feat-12'],
      done: ['feat-11'],
      pending: ['feat-12'],
      active: [],
      aborted: [],
    });

    const { registerResume } = await import('../../src/commands/resume.js');
    const program = new Command();
    registerResume(program);

    await program.parseAsync(['node', 'msq', 'resume', '9']);

    expect(mockLoadBacklog).toHaveBeenCalledWith('repo-1');
    expect(mockExecuteBacklog).toHaveBeenCalledWith(backlog, {
      cwd: '/tmp/resume-repo',
      concurrency: 3,
      resumePipelineId: 9,
      autoAdvanceStages: undefined,
    });
  });

  it('resume fails clearly when no pipeline is resumable', async () => {
    mockFindResumablePipeline.mockReturnValue(null);
    const { registerResume } = await import('../../src/commands/resume.js');
    const program = new Command();
    registerResume(program);

    await expect(
      program.parseAsync(['node', 'msq', 'resume', 'missing']),
    ).rejects.toThrow('Nenhuma pipeline retomável encontrada para "missing".');
  });

  it('resume applies --tool/--model/--effort as a pointwise override without touching backlog.yaml/catalog', async () => {
    const backlog = { version: 2, repo: 'demo', defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] }, epics: [] };
    mockLoadBacklog.mockReturnValue(backlog);
    mockFindResumablePipeline.mockReturnValue({
      id: 9,
      repoId: 'repo-1',
      cwd: '/tmp/resume-repo',
      autoAdvance: 0,
    });
    mockGetPipelineSnapshot.mockReturnValue({
      plan: ['feat-11', 'feat-12'],
      done: ['feat-11'],
      pending: [],
      active: ['feat-12'],
      aborted: [],
    });

    const { registerResume } = await import('../../src/commands/resume.js');
    const program = new Command();
    registerResume(program);

    await program.parseAsync(['node', 'msq', 'resume', '9', '--tool', 'opencode', '--model', 'gpt-4o', '--effort', 'high']);

    expect(mockGetAdapter).toHaveBeenCalledWith('opencode');
    expect(mockExecuteBacklog).toHaveBeenCalledWith(backlog, {
      cwd: '/tmp/resume-repo',
      concurrency: 3,
      resumePipelineId: 9,
      autoAdvanceStages: undefined,
      resumeOverride: { featureId: 'feat-12', tool: 'opencode', model: 'gpt-4o', effort: 'high' },
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Override pontual'));
  });

  it('rejects --tool outside the enum before touching the DB', async () => {
    const { registerResume } = await import('../../src/commands/resume.js');
    const program = new Command();
    program.exitOverride();
    registerResume(program);

    await expect(
      program.parseAsync(['node', 'msq', 'resume', '9', '--tool', 'not-a-tool']),
    ).rejects.toThrow();
    expect(mockFindResumablePipeline).not.toHaveBeenCalled();
  });

  it('rejects a valid --tool that is unavailable in the environment, without creating a run or resuming the pipeline', async () => {
    mockFindResumablePipeline.mockReturnValue({
      id: 9,
      repoId: 'repo-1',
      cwd: '/tmp/resume-repo',
      autoAdvance: 0,
    });
    mockGetAdapter.mockReturnValue({ isAvailable: () => false });

    const { registerResume } = await import('../../src/commands/resume.js');
    const program = new Command();
    registerResume(program);

    await expect(
      program.parseAsync(['node', 'msq', 'resume', '9', '--tool', 'codex']),
    ).rejects.toThrow('Ferramenta "codex" indisponível no ambiente atual — resume abortado, nenhuma run criada.');
    expect(mockGetPipelineSnapshot).not.toHaveBeenCalled();
    expect(mockExecuteBacklog).not.toHaveBeenCalled();
  });

  it('resume over an already-done pipeline prints "nada para retomar" and does not call executeBacklog', async () => {
    mockFindResumablePipeline.mockReturnValue({
      id: 9,
      repoId: 'repo-1',
      cwd: '/tmp/resume-repo',
      autoAdvance: 0,
    });
    mockGetPipelineSnapshot.mockReturnValue({ plan: ['feat-11'], done: ['feat-11'], pending: [], active: [], aborted: [] });

    const { registerResume } = await import('../../src/commands/resume.js');
    const program = new Command();
    registerResume(program);

    await program.parseAsync(['node', 'msq', 'resume', '9']);

    expect(log).toHaveBeenCalledWith('Pipeline 9 já concluída — nada para retomar.');
    expect(mockExecuteBacklog).not.toHaveBeenCalled();
  });

  it('config show prints resolved defaults for one feature as JSON', async () => {
    await import('node:fs').then(({ writeFileSync }) => writeFileSync(join(cwd, 'backlog.yaml'), 'version: 2\nrepo: demo\n'));
    mockLoadBacklog.mockReturnValue({
      version: 2,
      repo: 'demo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'], stageSkills: { plan: ['speckit-plan'] } },
      epics: [{
        id: 'e1',
        title: 'Epic',
        features: [{
          id: 'feat-1',
          title: 'Feature 1',
          tool: 'codex',
          effort: 'high',
          skills: ['implement'],
          dependsOn: [],
          tasks: [],
          workflow: {
            mode: 'staged',
            stages: ['implement'],
            approvals: { channel: 'telegram', autoAdvance: false },
            syncTasksToBacklog: true,
            sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
            stepGuidance: {},
          },
        }],
      }],
    });
    mockResolveConfigSnapshot.mockReturnValue({
      runtime: mockResolveRuntimeConfig(),
      repoDefaults: {
        tool: 'claude',
        model: 'app-model',
        effort: 'low',
        skills: ['app-skill'],
        stageSkills: { implement: ['app-stage-skill'] },
      },
      sources: { globalConfigPath: '/tmp/global.json', repoConfigPath: '/tmp/repo/.msq/config.yaml' },
    });

    const { registerConfig } = await import('../../src/commands/config.js');
    const program = new Command();
    registerConfig(program);

    await program.parseAsync(['node', 'msq', 'config', 'show', '--feature', 'feat-1', '--json']);

    const printed = log.mock.calls.at(-1)?.[0] as string;
    const payload = JSON.parse(printed) as {
      defaults: { project: { tool: string; skills: string[] }; repo?: unknown };
      feature: { id: string; effective: { effort: string; model?: string; skills: string[]; stageSkills: Record<string, string[]> } };
    };
    expect(payload.feature.id).toBe('feat-1');
    expect(payload.feature.effective.effort).toBe('high');
    expect(payload.feature.effective.model).toBeUndefined();
    expect(payload.feature.effective.skills).toEqual(['implement']);
    expect(payload.feature.effective.stageSkills).toEqual({ plan: ['speckit-plan'] });
    expect(payload.defaults.project).toMatchObject({ tool: 'codex', skills: ['implement'] });
    expect(payload.defaults.repo).toBeUndefined();
  });
});
