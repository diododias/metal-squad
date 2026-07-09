import { useState, useEffect, useRef } from 'react';
import { msqEventBus } from '../../core/events/index.js';

export interface NotificationEntry {
  id: number;
  event: string;
  message: string;
  ts: string;
}

export function useNotifications(maxItems = 12): NotificationEntry[] {
  const [items, setItems] = useState<NotificationEntry[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    const push = (event: string, message: string): void => {
      const entry: NotificationEntry = {
        id: ++counter.current,
        event,
        message,
        ts: new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };
      setItems((prev) => [entry, ...prev].slice(0, maxItems));
    };

    const unsubscribers = [
      msqEventBus.subscribe('run:start', ({ featureId }) =>
        { push('run:start', `${featureId} started`); }),
      msqEventBus.subscribe('gate:created', ({ gateId, featureId }) =>
        { push('gate:created', `gate ${String(gateId)} → ${featureId}`); }),
      msqEventBus.subscribe('gate:resolved', ({ gateId, decision }) =>
        { push('gate:resolved', `gate ${String(gateId)} ${decision}`); }),
      msqEventBus.subscribe('stage:request-created', ({ requestId, featureId, stage, prompt }) =>
        { push('stage:request-created', `stage:${String(requestId)} ${featureId} ${stage} · ${prompt}`); }),
      msqEventBus.subscribe('stage:request-resolved', ({ requestId, response }) =>
        { push('stage:request-resolved', formatStageResponse(requestId, response)); }),
      msqEventBus.subscribe('run:failed', ({ featureId }) =>
        { push('run:failed', `${featureId} failed`); }),
      msqEventBus.subscribe('budget:alert', ({ percent }) =>
        { push('budget:alert', `budget ${String(percent)}% reached`); }),
      msqEventBus.subscribe('run:done', ({ featureId }) =>
        { push('run:done', `${featureId} done`); }),
      msqEventBus.subscribe('ui:info', ({ message }) =>
        { push('ui:info', message); }),
      msqEventBus.subscribe('ui:notice', ({ message }) =>
        { push('ui:notice', message); }),
    ];

    return (): void => { for (const u of unsubscribers) u(); };
  }, [maxItems]);

  return items;
}

function formatStageResponse(requestId: number, response: string): string {
  if (response === 'advance') return `stage:${String(requestId)} approved and advanced`;
  if (response === 'hold') return `stage:${String(requestId)} skipped for now and kept on hold`;
  if (response === 'retry') return `stage:${String(requestId)} requested retry`;
  return `stage:${String(requestId)} resolved as ${response}`;
}
