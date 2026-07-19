import { describe, it, expect, vi } from 'vitest';
import { attachDefaultEventLogger } from '../../src/core/events/logging.js';

function makeEventBus() {
  const handlers: Record<string, Array<(event: unknown) => void>> = {};
  return {
    subscribe: vi.fn((event: string, handler: (e: unknown) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
      return () => {
        handlers[event] = handlers[event]?.filter((h) => h !== handler) ?? [];
      };
    }),
    emit(event: string, payload: unknown) {
      for (const h of handlers[event] ?? []) h(payload);
    },
  };
}

describe('attachDefaultEventLogger', () => {
  it('returns an unsubscribe function', () => {
    const bus = makeEventBus();
    const unsub = attachDefaultEventLogger(bus as never);
    expect(typeof unsub).toBe('function');
  });

  it('subscribes to run:start, run:output, run:done, run:failed', () => {
    const bus = makeEventBus();
    attachDefaultEventLogger(bus as never);
    const events = bus.subscribe.mock.calls.map((c) => c[0]);
    expect(events).toContain('run:start');
    expect(events).toContain('run:output');
    expect(events).toContain('run:done');
    expect(events).toContain('run:failed');
  });

  it('logs run:start with featureId and tool', () => {
    const bus = makeEventBus();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    attachDefaultEventLogger(bus as never);
    bus.emit('run:start', { featureId: 'feat-1', tool: 'claude' });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('feat-1'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('claude'));
    consoleSpy.mockRestore();
  });

  it('logs run:done with featureId and summary', () => {
    const bus = makeEventBus();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    attachDefaultEventLogger(bus as never);
    bus.emit('run:done', { featureId: 'feat-1', result: { summary: 'All done' } });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('feat-1'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('All done'));
    consoleSpy.mockRestore();
  });

  it('logs run:failed with featureId and error', () => {
    const bus = makeEventBus();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    attachDefaultEventLogger(bus as never);
    bus.emit('run:failed', { featureId: 'feat-2', error: 'timeout' });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('feat-2'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('timeout'));
    consoleSpy.mockRestore();
  });

  it('logs run:output with prefix when source differs from stream', () => {
    const bus = makeEventBus();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    attachDefaultEventLogger(bus as never);
    bus.emit('run:output', {
      runId: 1,
      featureId: 'feat-1',
      tool: 'claude',
      stream: 'stderr',
      source: 'tool',
      line: 'error output',
    });
    const loggedMsg = consoleSpy.mock.calls[0]?.[0] as string;
    expect(loggedMsg).toContain('tool/stderr');
    expect(loggedMsg).toContain('error output');
    consoleSpy.mockRestore();
  });

  it('logs run:output without prefix when source equals stream', () => {
    const bus = makeEventBus();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    attachDefaultEventLogger(bus as never);
    bus.emit('run:output', {
      runId: 1,
      featureId: 'feat-1',
      tool: 'claude',
      stream: 'stdout',
      source: 'stdout',
      line: 'normal output',
    });
    const loggedMsg = consoleSpy.mock.calls[0]?.[0] as string;
    expect(loggedMsg).toContain('stdout');
    expect(loggedMsg).not.toContain('stdout/stdout');
    consoleSpy.mockRestore();
  });

  it('logs run:output with run-{id} when featureId is missing', () => {
    const bus = makeEventBus();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    attachDefaultEventLogger(bus as never);
    bus.emit('run:output', {
      runId: 42,
      tool: 'codex',
      stream: 'stdout',
      source: 'stdout',
      line: 'output text',
    });
    const loggedMsg = consoleSpy.mock.calls[0]?.[0] as string;
    expect(loggedMsg).toContain('run-42');
    consoleSpy.mockRestore();
  });

  it('unsubscribes all handlers when returned function is called', () => {
    const bus = makeEventBus();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const unsub = attachDefaultEventLogger(bus as never);
    unsub();
    // After unsub, emitting events should NOT call console.log
    consoleSpy.mockClear();
    bus.emit('run:start', { featureId: 'feat-1', tool: 'claude' });
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('suppresses heartbeat rows from run:output (operator console)', () => {
    const bus = makeEventBus();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    attachDefaultEventLogger(bus as never);
    bus.emit('run:output', {
      runId: 1,
      tool: 'opencode',
      stream: 'stderr',
      source: 'heartbeat',
      line: '[msq] opencode running for 47s (stdout 1500B stderr 0B idle 12s)',
    });
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('logs run:failed with the aborted kind label', () => {
    const bus = makeEventBus();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    attachDefaultEventLogger(bus as never);
    bus.emit('run:failed', { featureId: 'feat-3', error: 'killed', kind: 'aborted' });
    const logged = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(logged.some((line) => line.includes('feat-3') && line.includes('(aborted)'))).toBe(true);
    consoleSpy.mockRestore();
  });

  it('logs gate:created, stage:request-created, budget:alert and run:blocked events', () => {
    const bus = makeEventBus();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    attachDefaultEventLogger(bus as never);
    bus.emit('gate:created', { gateId: 12, featureId: 'feat-1' });
    bus.emit('stage:request-created', { requestId: 7, featureId: 'feat-1', stage: 'implement', kind: 'approval', source: 'manual', prompt: 'ok?' });
    bus.emit('budget:alert', { percent: 90, spent: 900, limit: 1000 });
    bus.emit('run:blocked', { runId: 5, featureId: 'feat-1', reason: 'gate', code: 'needs_decision', summary: 'awaiting approval' });
    const lines = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('gate') && l.includes('feat-1'))).toBe(true);
    expect(lines.some((l) => l.includes('feat-1') && l.includes('approval'))).toBe(true);
    expect(lines.some((l) => l.includes('budget') && l.includes('90%'))).toBe(true);
    expect(lines.some((l) => l.includes('blocked') && l.includes('needs_decision'))).toBe(true);
    consoleSpy.mockRestore();
  });

  it('logs run:start with stage label when stage is present', () => {
    const bus = makeEventBus();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    attachDefaultEventLogger(bus as never);
    bus.emit('run:start', { featureId: 'feat-1', tool: 'codex', stage: 'specify' });
    const logged = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes('specify'))).toBe(true);
    consoleSpy.mockRestore();
  });
});
