import { appendRunOutput, updateRunUsage } from '../../db/repo.js';
import { msqEventBus } from './bus.js';
import type { TypedEventBus } from './bus.js';
import type { MsqEvents } from './types.js';

export function attachRunPersistence(
  eventBus: TypedEventBus<MsqEvents> = msqEventBus,
): () => void {
  const unsubscribers = [
    eventBus.subscribe('run:output', (event) => {
      appendRunOutput(event);
    }),
    eventBus.subscribe('tokens:update', (event) => {
      updateRunUsage(event.runId, event);
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
