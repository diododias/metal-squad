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
const mockEventEmit = vi.fn();
const mockAttachDefaultEventLogger = vi.fn();
const mockAttachEventNotifications = vi.fn();
const mockAttachRunPersistence = vi.fn();

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
}));

vi.mock('../../src/core/events/index.js', () => ({
  msqEventBus: {
    emit: mockEventEmit,
  },
  attachDefaultEventLogger: mockAttachDefaultEventLogger,
  attachEventNotifications: mockAttachEventNotifications,
  attachRunPersistence: mockAttachRunPersistence,
}));

vi.mock('../../src/config/index.js', () => ({
  loadConfig: () => ({ staleRunThresholdMinutes: 120, promptContextCharLimit: 20_000 }),
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
  mockEventEmit.mockReset();
  mockAttachDefaultEventLogger.mockReset();
  mockAttachEventNotifications.mockReset();
  mockAttachRunPersistence.mockReset();
  mockResolveRepo.mockReturnValue({ repoId: 'repo-1', path: '/repo' });
  mockCreateRun.mockReturnValue(7);
  mockAttachDefaultEventLogger.mockReturnValue(vi.fn());
  mockAttachEventNotifications.mockReturnValue(vi.fn());
  mockAttachRunPersistence.mockReturnValue(vi.fn());
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
    expect(mockRunFeature).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      { cwd: '/repo', runId: 7 },
    );
    expect(mockAttachDefaultEventLogger).toHaveBeenCalled();
    expect(mockAttachEventNotifications).toHaveBeenCalled();
    expect(mockAttachRunPersistence).toHaveBeenCalled();
    expect(mockEventEmit).toHaveBeenCalledWith('run:start', {
      runId: 7,
      featureId: 'feat-02',
      tool: 'codex',
    });
    expect(mockEventEmit).toHaveBeenCalledWith('run:failed', {
      runId: 7,
      featureId: 'feat-02',
      tool: 'codex',
      error: 'timeout após 605s. última mensagem do agente: Atualizando registry. arquivos tocados: src/core/skills/registry.ts',
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
