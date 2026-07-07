import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMsqEventBus } from '../../src/core/events/bus.js';

const mockDispatch = vi.fn();

vi.mock('../../src/core/notify/manager.js', () => ({
  dispatch: mockDispatch,
}));

beforeEach(() => {
  vi.resetModules();
  mockDispatch.mockReset();
  mockDispatch.mockResolvedValue(undefined);
});

describe('attachEventNotifications — full coverage', () => {
  it('dispatches run:start with stage label when stage is provided', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const bus = createMsqEventBus();
    attachEventNotifications(bus);

    bus.emit('run:start', { runId: 1, featureId: 'feat-1', tool: 'claude', stage: 'review' });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const [event, msg, meta] = mockDispatch.mock.calls[0]!;
    expect(event).toBe('run:start');
    expect(msg).toContain('feat-1');
    expect(msg).toContain('claude');
    expect(msg).toContain('stage: review');
    expect((meta as Record<string, unknown>).stage).toBe('review');
  });

  it('dispatches run:start without stage label when stage is absent', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const bus = createMsqEventBus();
    attachEventNotifications(bus);

    bus.emit('run:start', { runId: 1, featureId: 'feat-2', tool: 'codex' });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const [, msg] = mockDispatch.mock.calls[0]!;
    expect(msg).not.toContain('stage:');
    expect(msg).not.toContain('· stage');
  });

  it('dispatches gate:created with approve/skip/retry keyboard', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const bus = createMsqEventBus();
    attachEventNotifications(bus);

    bus.emit('gate:created', { gateId: 5, runId: 1, featureId: 'feat-3', repoId: 'r1' });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const [event, msg, meta] = mockDispatch.mock.calls[0]!;
    expect(event).toBe('gate:created');
    expect(msg).toContain('gate 5');
    expect(msg).toContain('feat-3');
    expect(msg).toContain('gate:5 approve');
    expect(msg).toContain('gate:5 skip');
    expect(msg).toContain('gate:5 retry');
    expect((meta as Record<string, unknown>).reply_markup).toBeDefined();
    expect((meta as Record<string, unknown>).gateId).toBe(5);
    expect((meta as Record<string, unknown>).featureId).toBe('feat-3');
  });

  it('dispatches stage:approval with reply_markup for manual source', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const bus = createMsqEventBus();
    attachEventNotifications(bus);

    bus.emit('stage:request-created', {
      requestId: 10,
      pipelineId: 1,
      featureId: 'feat-4',
      stage: 'implement',
      kind: 'approval',
      prompt: 'Ready to advance?',
      source: 'manual',
    });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const [event, msg, meta] = mockDispatch.mock.calls[0]!;
    expect(event).toBe('stage:approval');
    expect(msg).toContain('feat-4');
    expect(msg).toContain('implement');
    expect(msg).toContain('stage:10 advance');
    expect(msg).toContain('stage:10 retry');
    expect(msg).toContain('stage:10 hold');
    expect((meta as Record<string, unknown>).reply_markup).toBeDefined();
    expect((meta as Record<string, unknown>).source).toBe('manual');
    expect((meta as Record<string, unknown>).requestId).toBe(10);
  });

  it('dispatches stage:approval without reply_markup for auto source', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const bus = createMsqEventBus();
    attachEventNotifications(bus);

    bus.emit('stage:request-created', {
      requestId: 11,
      pipelineId: 1,
      featureId: 'feat-5',
      stage: 'review',
      kind: 'approval',
      prompt: 'Auto-approving...',
      source: 'auto',
    });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const [event, msg, meta] = mockDispatch.mock.calls[0]!;
    expect(event).toBe('stage:approval');
    expect(msg).toContain('feat-5');
    expect(msg).toContain('Auto-advance registered');
    expect((meta as Record<string, unknown>).source).toBe('auto');
    expect((meta as Record<string, unknown>).reply_markup).toBeUndefined();
  });

  it('dispatches stage:input for input kind', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const bus = createMsqEventBus();
    attachEventNotifications(bus);

    bus.emit('stage:request-created', {
      requestId: 12,
      pipelineId: 1,
      featureId: 'feat-6',
      stage: 'test',
      kind: 'input',
      prompt: 'Enter test config:',
      source: 'manual',
    });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const [event, msg, meta] = mockDispatch.mock.calls[0]!;
    expect(event).toBe('stage:input');
    expect(msg).toContain('feat-6');
    expect(msg).toContain('needs human input');
    expect(msg).toContain('input:12 <text>');
    expect((meta as Record<string, unknown>).requestId).toBe(12);
  });

  it('dispatches run:failed with featureId and error', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const bus = createMsqEventBus();
    attachEventNotifications(bus);

    bus.emit('run:failed', { runId: 1, featureId: 'feat-7', error: 'adapter crash' });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const [event, msg, meta] = mockDispatch.mock.calls[0]!;
    expect(event).toBe('run:failed');
    expect(msg).toContain('feat-7');
    expect(msg).toContain('adapter crash');
    expect((meta as Record<string, unknown>).error).toBe('adapter crash');
    expect((meta as Record<string, unknown>).featureId).toBe('feat-7');
  });

  it('dispatches budget:alert with percent info', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const bus = createMsqEventBus();
    attachEventNotifications(bus);

    bus.emit('budget:alert', { percent: 80, spent: 80000, limit: 100000 });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const [event, msg, meta] = mockDispatch.mock.calls[0]!;
    expect(event).toBe('budget:alert');
    expect(msg).toContain('80%');
    expect(msg).toContain('80000');
    expect(msg).toContain('100000');
    expect((meta as Record<string, unknown>).percent).toBe(80);
    expect((meta as Record<string, unknown>).spent).toBe(80000);
    expect((meta as Record<string, unknown>).limit).toBe(100000);
  });

  it('dispatches run:done with featureId and summary', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const bus = createMsqEventBus();
    attachEventNotifications(bus);

    bus.emit('run:done', {
      runId: 1,
      featureId: 'feat-8',
      result: { summary: 'Completed all tasks', exitCode: 0, durationMs: 5000 },
    });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const [event, msg, meta] = mockDispatch.mock.calls[0]!;
    expect(event).toBe('run:done');
    expect(msg).toContain('feat-8');
    expect(msg).toContain('Completed all tasks');
    expect((meta as Record<string, unknown>).featureId).toBe('feat-8');
  });

  it('returns unsubscribe function that stops all dispatches', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const bus = createMsqEventBus();
    const detach = attachEventNotifications(bus);
    detach();

    bus.emit('run:start', { runId: 1, featureId: 'feat-9', tool: 'claude' });
    bus.emit('run:done', { runId: 1, featureId: 'feat-9', result: { summary: 'done', exitCode: 0, durationMs: 0 } });
    bus.emit('run:failed', { runId: 1, featureId: 'feat-9', error: 'err' });
    bus.emit('budget:alert', { percent: 90, spent: 9000, limit: 10000 });

    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
