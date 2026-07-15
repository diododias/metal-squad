import { EventEmitter } from 'node:events';
import type { SessionStatusSnapshot, ToolCallRecord } from '../../src/core/adapters/types.js';

export function createFakeChild(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: (signal?: string) => void } {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: (signal?: string) => void };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => undefined;
  return child;
}

export function createFakeClock(start = 1_700_000_000_000): { now: () => number; advance: (ms: number) => number } {
  let current = start;
  return { now: () => current, advance: (ms: number) => { current += ms; return current; } };
}

export function createSessionStatus(overrides: Partial<SessionStatusSnapshot> = {}): SessionStatusSnapshot {
  return {
    runId: 1,
    featureId: 'feat-1',
    tool: 'codex',
    status: 'running',
    startedAt: new Date(1_700_000_000_000).toISOString(),
    updatedAt: new Date(1_700_000_000_000).toISOString(),
    elapsedMs: 0,
    lastOutputAt: null,
    idleMs: null,
    reason: null,
    terminal: false,
    ...overrides,
  };
}

export function createToolCall(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    id: 'call-1',
    runId: 1,
    featureId: 'feat-1',
    tool: 'codex',
    sequence: 1,
    phase: 'started',
    name: 'shell',
    arguments: { command: 'pwd' },
    output: null,
    step: 'implement',
    startedAt: new Date(1_700_000_000_000).toISOString(),
    completedAt: null,
    error: null,
    ...overrides,
  };
}
