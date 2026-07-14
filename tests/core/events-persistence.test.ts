import { describe, it, expect, vi, afterEach } from 'vitest';

const appendRunOutput = vi.fn();
const recordContextQuery = vi.fn();
const recordRunEvent = vi.fn();
const updateRunUsage = vi.fn();
const upsertTaskRun = vi.fn();

vi.mock('../../src/db/repo.js', () => ({
  appendRunOutput,
  recordContextQuery,
  recordRunEvent,
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

  it('derives and persists context queries from tool output', async () => {
    const { attachRunPersistence } = await import('../../src/core/events/persistence.js');
    const { createMsqEventBus } = await import('../../src/core/events/bus.js');

    const bus = createMsqEventBus();
    const detach = attachRunPersistence(bus);

    bus.emit('run:output', {
      runId: 8,
      featureId: 'feat-16',
      tool: 'codex',
      line: 'tool mcp__serena__find_symbol {"name_path":"Foo/bar"}',
      stream: 'stdout',
      source: 'tool',
    });

    expect(recordContextQuery).toHaveBeenCalledWith(expect.objectContaining({
      runId: 8,
      queryTool: 'serena',
      kind: 'structured',
    }));

    detach();
  });

  it('persists timeout approval lifecycle events', async () => {
    const { attachRunPersistence } = await import('../../src/core/events/persistence.js');
    const { createMsqEventBus } = await import('../../src/core/events/bus.js');

    const bus = createMsqEventBus();
    const detach = attachRunPersistence(bus);

    bus.emit('timeout:approval-created', {
      requestId: 51,
      occurrenceId: 12,
      runId: 8,
      pipelineId: 4,
      featureId: 'feat-timeout',
      stage: 'implement',
      timeoutMs: 600_000,
      runtimeMs: 605_000,
      lastProgress: 'still writing tests',
    });
    bus.emit('timeout:approval-resolved', {
      requestId: 51,
      occurrenceId: 12,
      runId: 8,
      featureId: 'feat-timeout',
      stage: 'implement',
      decision: 'retry',
      source: 'telegram',
    });

    expect(recordRunEvent).toHaveBeenNthCalledWith(
      1,
      8,
      'timeout:approval-created',
      expect.objectContaining({ requestId: 51, stage: 'implement' }),
    );
    expect(recordRunEvent).toHaveBeenNthCalledWith(
      2,
      8,
      'timeout:approval-resolved',
      expect.objectContaining({ requestId: 51, decision: 'retry' }),
    );

    detach();
  });
});
