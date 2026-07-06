import { describe, it, expect, vi } from 'vitest';
import { TypedEventEmitter, bus } from '../../src/core/events/bus.js';
import type { MsqEvents } from '../../src/core/events/bus.js';

describe('TypedEventEmitter', () => {
  it('emits and receives typed events', () => {
    const emitter = new TypedEventEmitter<MsqEvents>();
    const listener = vi.fn();

    emitter.on('run:start', listener);
    emitter.emit('run:start', { runId: 1, featureId: 'feat-01', tool: 'claude' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ runId: 1, featureId: 'feat-01', tool: 'claude' });
  });

  it('off removes a specific listener', () => {
    const emitter = new TypedEventEmitter<MsqEvents>();
    const listener = vi.fn();

    emitter.on('run:done', listener);
    emitter.off('run:done', listener);
    emitter.emit('run:done', { runId: 2, result: { ok: true, summary: 'done' } });

    expect(listener).not.toHaveBeenCalled();
  });

  it('once fires only on the first emission', () => {
    const emitter = new TypedEventEmitter<MsqEvents>();
    const listener = vi.fn();

    emitter.once('run:failed', listener);
    emitter.emit('run:failed', { runId: 3, error: 'boom' });
    emitter.emit('run:failed', { runId: 4, error: 'boom again' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ runId: 3, error: 'boom' });
  });

  it('multiple listeners on the same event all receive the payload', () => {
    const emitter = new TypedEventEmitter<MsqEvents>();
    const a = vi.fn();
    const b = vi.fn();

    emitter.on('tokens:update', a);
    emitter.on('tokens:update', b);
    emitter.emit('tokens:update', { runId: 5, input: 100, output: 50 });

    expect(a).toHaveBeenCalledWith({ runId: 5, input: 100, output: 50 });
    expect(b).toHaveBeenCalledWith({ runId: 5, input: 100, output: 50 });
  });

  it('zero-payload events (scheduler:paused) emit and receive without error', () => {
    const emitter = new TypedEventEmitter<MsqEvents>();
    const listener = vi.fn();

    emitter.on('scheduler:paused', listener);
    emitter.emit('scheduler:paused', {});

    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('bus singleton', () => {
  it('is a shared TypedEventEmitter instance', () => {
    expect(bus).toBeInstanceOf(TypedEventEmitter);
  });

  it('listener registered with a zero-arg callback receives gate:resolved', () => {
    const refresh = vi.fn();
    bus.on('gate:resolved', refresh);
    bus.emit('gate:resolved', { gateId: 10, decision: 'approved' });
    bus.off('gate:resolved', refresh);

    expect(refresh).toHaveBeenCalledOnce();
  });
});
