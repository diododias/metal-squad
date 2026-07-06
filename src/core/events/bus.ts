import { EventEmitter } from 'node:events';
import type { RunResult } from '../adapters/types.js';
import type { GateDecision } from '../../db/repo.js';

export interface MsqEvents {
  'run:start': { runId: number; featureId: string; tool: string };
  'run:output': { runId: number; line: string; stream: 'stdout' | 'stderr' };
  'run:done': { runId: number; result: RunResult };
  'run:failed': { runId: number; error: string };
  'gate:created': { gateId: number; featureId: string };
  'gate:resolved': { gateId: number; decision: GateDecision };
  'scheduler:paused': Record<never, never>;
  'scheduler:resumed': Record<never, never>;
  'budget:alert': { percent: number; spent: number; limit: number };
  'tokens:update': { runId: number; input: number; output: number };
}

export class TypedEventEmitter<Events extends object> extends EventEmitter {
  override emit<K extends keyof Events & string>(event: K, payload: Events[K]): boolean {
    return super.emit(event, payload);
  }

  override on<K extends keyof Events & string>(event: K, listener: (payload: Events[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof Events & string>(event: K, listener: (payload: Events[K]) => void): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends keyof Events & string>(event: K, listener: (payload: Events[K]) => void): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }
}

export const bus = new TypedEventEmitter<MsqEvents>();
