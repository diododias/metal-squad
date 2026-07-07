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
    const push = (event: string, message: string) => {
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
      msqEventBus.subscribe('gate:created', ({ gateId, featureId }) =>
        push('gate:created', `gate ${gateId} → ${featureId}`)),
      msqEventBus.subscribe('run:failed', ({ featureId }) =>
        push('run:failed', `${featureId} failed`)),
      msqEventBus.subscribe('budget:alert', ({ percent }) =>
        push('budget:alert', `budget ${percent}% reached`)),
      msqEventBus.subscribe('run:done', ({ featureId }) =>
        push('run:done', `${featureId} done`)),
    ];

    return () => { for (const u of unsubscribers) u(); };
  }, [maxItems]);

  return items;
}
