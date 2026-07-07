import { describe, it, expect, vi, afterEach } from 'vitest';

const appendRunOutput = vi.fn();
const updateRunUsage = vi.fn();
const upsertTaskRun = vi.fn();

vi.mock('../../src/db/repo.js', () => ({
  appendRunOutput,
  updateRunUsage,
  upsertTaskRun,
}));

describe('event persistence', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('persists run output, usage, and task lifecycle events', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T12:00:00.000Z'));

    const { attachRunPersistence } = await import('../../src/core/events/persistence.js');
    const { createMsqEventBus } = await import('../../src/core/events/bus.js');

    const bus = createMsqEventBus();
    const detach = attachRunPersistence(bus);

    bus.emit('run:output', {
      runId: 7,
      featureId: 'feat-15',
      tool: 'codex',
      line: 'hello',
      stream: 'stdout',
      source: 'agent',
    });
    bus.emit('tokens:update', {
      runId: 7,
      featureId: 'feat-15',
      tool: 'codex',
      input: 10,
      cachedInput: 4,
      output: 5,
      total: 15,
    });
    bus.emit('task:started', {
      runId: 7,
      featureId: 'feat-15',
      taskId: 'T1',
      title: 'Implement bus',
      stage: 'implement',
    });
    bus.emit('task:updated', {
      runId: 7,
      featureId: 'feat-15',
      taskId: 'T1',
      status: 'done',
      stage: 'implement',
      endedAt: '2026-07-06T12:10:00.000Z',
    });

    expect(appendRunOutput).toHaveBeenCalledWith(expect.objectContaining({ runId: 7, line: 'hello' }));
    expect(updateRunUsage).toHaveBeenCalledWith(7, expect.objectContaining({ cachedInput: 4, total: 15 }));
    expect(upsertTaskRun).toHaveBeenNthCalledWith(
      1,
      7,
      'T1',
      'Implement bus',
      'running',
      'implement',
      '2026-07-06T12:00:00.000Z',
    );
    expect(upsertTaskRun).toHaveBeenNthCalledWith(
      2,
      7,
      'T1',
      'T1',
      'done',
      'implement',
      undefined,
      '2026-07-06T12:10:00.000Z',
    );

    detach();
  });
});
