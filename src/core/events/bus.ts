import { EventEmitter } from 'node:events';
import type { MsqEvents } from './types.js';

export class TypedEventBus<Events extends object> {
  private readonly emitter = new EventEmitter();

  public emit<K extends keyof Events & string>(event: K, payload: Events[K]): void {
    this.emitter.emit(event, payload);
  }

  public subscribe<K extends keyof Events & string>(
    event: K,
    listener: (payload: Events[K]) => void,
  ): () => void {
    const typedListener = listener as (payload: unknown) => void;
    this.emitter.on(event, typedListener);
    return () => {
      this.emitter.off(event, typedListener);
    };
  }

  public removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}

export function createMsqEventBus(): TypedEventBus<MsqEvents> {
  return new TypedEventBus<MsqEvents>();
}

export const msqEventBus = createMsqEventBus();
