import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetRun = vi.fn();
const mockGetPipeline = vi.fn();
const mockResumePipeline = vi.fn();
const mockRecordRunEvent = vi.fn();
const mockEmit = vi.fn();

vi.mock('../../src/db/repo.js', () => ({
  getRun: mockGetRun,
  getPipeline: mockGetPipeline,
  resumePipeline: mockResumePipeline,
  recordRunEvent: mockRecordRunEvent,
}));
vi.mock('../../src/core/events/bus.js', () => ({ msqEventBus: { emit: mockEmit } }));

describe('resumeBlockedRun', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetRun.mockReset();
    mockGetPipeline.mockReset();
    mockResumePipeline.mockReset();
    mockRecordRunEvent.mockReset();
    mockEmit.mockReset();
  });

  it('requeues the blocked pipeline through the existing resume mechanism', async () => {
    mockGetRun.mockReturnValue({ id: 276, status: 'blocked', pipeline_id: 44 });
    mockGetPipeline.mockReturnValue({ id: 44, status: 'blocked' });
    const { resumeBlockedRun } = await import('../../src/core/runner/resume-blocked-run.js');

    resumeBlockedRun(276);

    expect(mockResumePipeline).toHaveBeenCalledWith(44);
    expect(mockRecordRunEvent).toHaveBeenCalledWith(276, 'blocked_resumed', {
      source: 'telegram',
      pipelineId: 44,
    });
    expect(mockEmit).toHaveBeenCalledWith('ui:info', expect.objectContaining({ message: expect.stringContaining('276') }));
  });

  it('rejects an invalid or already-resolved run without changing pipeline state', async () => {
    mockGetRun.mockReturnValue({ id: 276, status: 'done', pipeline_id: 44 });
    const { resumeBlockedRun } = await import('../../src/core/runner/resume-blocked-run.js');

    expect(() => resumeBlockedRun(276)).toThrow('is not blocked');
    expect(() => resumeBlockedRun(0)).toThrow('positive integer');
    expect(mockResumePipeline).not.toHaveBeenCalled();
  });
});
