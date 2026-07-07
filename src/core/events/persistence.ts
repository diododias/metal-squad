import { appendRunOutput, updateRunUsage, upsertTaskRun } from '../../db/repo.js';
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
    eventBus.subscribe('task:started', (event) => {
      upsertTaskRun(
        event.runId,
        event.taskId,
        event.title,
        'running',
        event.stage,
        new Date().toISOString(),
      );
    }),
    eventBus.subscribe('task:updated', (event) => {
      upsertTaskRun(
        event.runId,
        event.taskId,
        event.taskId,
        event.status,
        event.stage,
        undefined,
        event.endedAt,
      );
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
