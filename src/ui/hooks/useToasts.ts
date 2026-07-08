import { useEffect, useRef, useState } from 'react';
import { msqEventBus } from '../../core/events/index.js';

export interface ToastEntry {
  id: number;
  event: string;
  message: string;
  tone: 'info' | 'warning' | 'error' | 'success';
  expiresAt: number;
}

const DEFAULT_TTL_MS = 4200;

export function useToasts(maxItems = 4): ToastEntry[] {
  const [items, setItems] = useState<ToastEntry[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    const push = (
      event: string,
      message: string,
      tone: ToastEntry['tone'],
      ttlMs = DEFAULT_TTL_MS,
    ) => {
      const entry: ToastEntry = {
        id: ++counter.current,
        event,
        message,
        tone,
        expiresAt: Date.now() + ttlMs,
      };
      setItems((prev) => [entry, ...prev].slice(0, maxItems));
    };

    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      setItems((prev) => prev.filter((entry) => entry.expiresAt > now));
    }, 400);

    const unsubscribers = [
      msqEventBus.subscribe('run:start', ({ featureId }) =>
        push('run:start', `${featureId} started`, 'info')),
      msqEventBus.subscribe('run:done', ({ featureId }) =>
        push('run:done', `${featureId} done`, 'success')),
      msqEventBus.subscribe('run:failed', ({ featureId, error }) =>
        push('run:failed', `${featureId} failed: ${error}`, 'error', 5200)),
      msqEventBus.subscribe('gate:resolved', ({ gateId, decision }) =>
        push('gate:resolved', `Gate ${gateId} ${decision}`, 'warning')),
      msqEventBus.subscribe('stage:request-resolved', ({ requestId, response }) =>
        push('stage:request-resolved', `Stage request ${requestId} ${response}`, 'warning')),
      msqEventBus.subscribe('budget:alert', ({ percent }) =>
        push('budget:alert', `Budget ${percent}% reached`, 'warning', 5200)),
      msqEventBus.subscribe('ui:info', ({ message }) =>
        push('ui:info', message, 'info')),
      msqEventBus.subscribe('ui:notice', ({ message }) =>
        push('ui:notice', message, 'error', 5200)),
    ];

    return () => {
      clearInterval(cleanupTimer);
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [maxItems]);

  return items;
}
