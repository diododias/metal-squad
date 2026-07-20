import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetPipeline = vi.fn();
const mockFindResumablePipeline = vi.fn();
const mockGetLatestRunForPipeline = vi.fn();
const mockRecordRunEvent = vi.fn();
const mockGetAdapter = vi.fn();
const mockSpawn = vi.fn();
const mockEventBusEmit = vi.fn();

vi.mock('../../src/db/repo.js', () => ({
  getPipeline: mockGetPipeline,
  findResumablePipeline: mockFindResumablePipeline,
  getLatestRunForPipeline: mockGetLatestRunForPipeline,
  recordRunEvent: mockRecordRunEvent,
}));
vi.mock('../../src/core/adapters/index.js', () => ({
  getAdapter: mockGetAdapter,
}));
vi.mock('../../src/core/events/bus.js', () => ({
  msqEventBus: { emit: mockEventBusEmit },
}));
vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

beforeEach(() => {
  vi.resetModules();
  mockGetPipeline.mockReset();
  mockGetPipeline.mockReturnValue(null);
  mockFindResumablePipeline.mockReset();
  mockFindResumablePipeline.mockReturnValue(null);
  mockGetLatestRunForPipeline.mockReset();
  mockGetLatestRunForPipeline.mockReturnValue(null);
  mockRecordRunEvent.mockReset();
  mockGetAdapter.mockReset();
  mockGetAdapter.mockReturnValue({ isAvailable: () => true });
  mockSpawn.mockReset();
  mockSpawn.mockReturnValue({ once: vi.fn(), unref: vi.fn() });
  mockEventBusEmit.mockReset();
  process.argv[1] = '/path/to/msq';
});

describe('resumePipelineWithOverride', () => {
  it('spawns msq resume with the chosen tool when pipeline and adapter are valid', async () => {
    mockGetPipeline.mockReturnValue({ id: 123, cwd: '/repo' });

    const { resumePipelineWithOverride } = await import('../../src/core/notify/resume-override.js');
    resumePipelineWithOverride({ pipelineId: 123, tool: 'claude' });

    expect(mockGetAdapter).toHaveBeenCalledWith('claude');
    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [process.execArgv, '/path/to/msq', 'resume', '123', '--tool', 'claude'].flat(),
      expect.objectContaining({ cwd: '/repo', detached: true, stdio: 'ignore' }),
    );
    expect(mockEventBusEmit).toHaveBeenCalledWith('ui:info', expect.objectContaining({ message: expect.stringContaining('Resuming pipeline 123') }));
  });

  it('refuses to resume when the pipeline has no cwd', async () => {
    mockGetPipeline.mockReturnValue({ id: 123, cwd: null });

    const { resumePipelineWithOverride } = await import('../../src/core/notify/resume-override.js');
    resumePipelineWithOverride({ pipelineId: 123, tool: 'claude' });

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockEventBusEmit).toHaveBeenCalledWith('ui:notice', expect.objectContaining({ message: expect.stringContaining('no cwd persisted') }));
  });

  it('refuses to resume when the chosen adapter is unavailable', async () => {
    mockGetPipeline.mockReturnValue({ id: 123, cwd: '/repo' });
    mockGetAdapter.mockReturnValue({ isAvailable: () => false });

    const { resumePipelineWithOverride } = await import('../../src/core/notify/resume-override.js');
    resumePipelineWithOverride({ pipelineId: 123, tool: 'opencode' });

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockEventBusEmit).toHaveBeenCalledWith('ui:notice', expect.objectContaining({ message: expect.stringContaining('unavailable') }));
  });

  it('falls back to findResumablePipeline when getPipeline returns null', async () => {
    mockFindResumablePipeline.mockReturnValue({ id: 123, cwd: '/repo' });

    const { resumePipelineWithOverride } = await import('../../src/core/notify/resume-override.js');
    resumePipelineWithOverride({ pipelineId: 123, tool: 'codex' });

    expect(mockFindResumablePipeline).toHaveBeenCalledWith('123');
    expect(mockSpawn).toHaveBeenCalled();
  });

  it('records a resume_override run event with source telegram when a run exists for the pipeline', async () => {
    mockGetPipeline.mockReturnValue({ id: 123, cwd: '/repo' });
    mockGetLatestRunForPipeline.mockReturnValue({ id: 456 });

    const { resumePipelineWithOverride } = await import('../../src/core/notify/resume-override.js');
    resumePipelineWithOverride({ pipelineId: 123, tool: 'claude' });

    expect(mockGetLatestRunForPipeline).toHaveBeenCalledWith(123);
    expect(mockRecordRunEvent).toHaveBeenCalledWith(456, 'resume_override', { source: 'telegram', tool: 'claude' });
  });

  it('skips recording a run event when no run exists for the pipeline', async () => {
    mockGetPipeline.mockReturnValue({ id: 123, cwd: '/repo' });
    mockGetLatestRunForPipeline.mockReturnValue(null);

    const { resumePipelineWithOverride } = await import('../../src/core/notify/resume-override.js');
    resumePipelineWithOverride({ pipelineId: 123, tool: 'claude' });

    expect(mockRecordRunEvent).not.toHaveBeenCalled();
  });
});
