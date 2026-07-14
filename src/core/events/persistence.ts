import { appendRunOutput, recordContextQuery, updateRunUsage, upsertRunSessionStatus, upsertRunToolCall, upsertTaskRun } from '../../db/repo.js';
import { msqEventBus } from './bus.js';
import type { TypedEventBus } from './bus.js';
import { deriveContextQueryEvent } from './context-query.js';
import type { MsqEvents } from './types.js';

export function attachRunPersistence(
  eventBus: TypedEventBus<MsqEvents> = msqEventBus,
): () => void {
  const unsubscribers = [
    eventBus.subscribe('run:status', (event) => {
      upsertRunSessionStatus(event);
    }),
    eventBus.subscribe('tool:call', (event) => {
      upsertRunToolCall(event);
    }),
    eventBus.subscribe('run:output', (event) => {
      appendRunOutput(event);
      const contextQuery = deriveContextQueryEvent(event);
      if (contextQuery) eventBus.emit('context:query', contextQuery);
    }),
    eventBus.subscribe('tokens:update', (event) => {
      updateRunUsage(event.runId, event);
    }),
    eventBus.subscribe('context:query', (event) => {
      recordContextQuery(event);
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
