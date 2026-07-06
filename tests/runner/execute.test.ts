import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Backlog } from '../../src/core/backlog/schema.js';

const mockResolveRepo = vi.fn();
const mockRegisterRepo = vi.fn();
const mockCleanupStaleRuns = vi.fn();
const mockCreateRun = vi.fn();
const mockFinishRun = vi.fn();
const mockRecordUsage = vi.fn();
const mockNotify = vi.fn();
const mockRunFeature = vi.fn();
const mockBusEmit = vi.fn();

vi.mock('../../src/core/repo.js', () => ({
  resolveRepo: mockResolveRepo,
}));

vi.mock('../../src/db/repo.js', () => ({
  registerRepo: mockRegisterRepo,
  cleanupStaleRuns: mockCleanupStaleRuns,
  createRun: mockCreateRun,
  finishRun: mockFinishRun,
  recordUsage: mockRecordUsage,
}));

vi.mock('../../src/core/adapters/index.js', () => ({
  getAdapter: () => ({ runFeature: mockRunFeature }),
}));

vi.mock('../../src/core/notify/telegram.js', () => ({
  notify: mockNotify,
  subscribeToNotifications: vi.fn(() => () => {}),
}));

vi.mock('../../src/core/events/bus.js', () => ({
  bus: { emit: mockBusEmit },
}));

vi.mock('../../src/config/index.js', () => ({
  loadConfig: () => ({ staleRunThresholdMinutes: 120 }),
}));

beforeEach(() => {
  mockResolveRepo.mockReset();
  mockRegisterRepo.mockReset();
  mockCleanupStaleRuns.mockReset();
  mockCreateRun.mockReset();
  mockFinishRun.mockReset();
  mockRecordUsage.mockReset();
  mockNotify.mockReset();
  mockRunFeature.mockReset();
  mockBusEmit.mockReset();
  mockResolveRepo.mockReturnValue({ repoId: 'repo-1', path: '/repo' });
  mockCreateRun.mockReturnValue(7);
});

describe('executeBacklog failure persistence', () => {
  it('stores failed status with partial summary from adapter timeout', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-02',
              title: 'Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
            },
          ],
        },
      ],
    };

    mockRunFeature.mockResolvedValue({
      ok: false,
      summary:
        'timeout após 605s. última mensagem do agente: Atualizando registry. arquivos tocados: src/core/skills/registry.ts',
    });

    const { executeBacklog } = await import('../../src/core/runner/execute.js');

    await expect(
      executeBacklog(backlog, { cwd: '/repo', concurrency: 1 }),
    ).rejects.toThrow(
      'Feature feat-02 falhou: timeout após 605s. última mensagem do agente: Atualizando registry. arquivos tocados: src/core/skills/registry.ts',
    );

    expect(mockFinishRun).toHaveBeenCalledWith(
      7,
      'failed',
      'timeout após 605s. última mensagem do agente: Atualizando registry. arquivos tocados: src/core/skills/registry.ts',
    );
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockBusEmit).toHaveBeenCalledWith(
      'run:start',
      { runId: 7, featureId: 'feat-02', tool: 'codex' },
    );
    expect(mockBusEmit).toHaveBeenCalledWith(
      'run:failed',
      {
        runId: 7,
        error:
          'timeout após 605s. última mensagem do agente: Atualizando registry. arquivos tocados: src/core/skills/registry.ts',
      },
    );
  });

  it('emits output, tokens and completion events on successful runs', async () => {
    const backlog: Backlog = {
      version: 2,
      repo: 'repo',
      defaults: { tool: 'codex', effort: 'medium', skills: ['implement'] },
      epics: [
        {
          id: 'epic-1',
          title: 'Epic',
          features: [
            {
              id: 'feat-15',
              title: 'Feature',
              spec: 'spec',
              tasks: [],
              tool: 'codex',
              effort: 'medium',
              dependsOn: [],
            },
          ],
        },
      ],
    };

    mockRunFeature.mockImplementation(
      async (_feature: unknown, _prompt: string, _cwd: string, opts?: { onOutput?: (line: string, stream: 'stdout' | 'stderr') => void }) => {
        opts?.onOutput?.('linha do agente', 'stdout');
        return {
          ok: true,
          summary: 'ok',
          usage: { input: 10, output: 20, total: 30 },
        };
      },
    );

    const { executeBacklog } = await import('../../src/core/runner/execute.js');
    await expect(executeBacklog(backlog, { cwd: '/repo', concurrency: 1 })).resolves.toBeUndefined();

    expect(mockRecordUsage).toHaveBeenCalledWith(7, { input: 10, output: 20, total: 30 });
    expect(mockBusEmit).toHaveBeenCalledWith(
      'run:output',
      { runId: 7, line: 'linha do agente', stream: 'stdout' },
    );
    expect(mockBusEmit).toHaveBeenCalledWith(
      'tokens:update',
      { runId: 7, input: 10, output: 20 },
    );
    expect(mockBusEmit).toHaveBeenCalledWith(
      'run:done',
      { runId: 7, result: { ok: true, summary: 'ok', usage: { input: 10, output: 20, total: 30 } } },
    );
  });
});
