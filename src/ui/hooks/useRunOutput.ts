import { useCallback, useEffect, useRef, useState } from 'react';
import { listRunOutput, type RunOutputRow } from '../../db/repo.js';
import { msqEventBus, logCaughtError } from '../../core/events/index.js';

const MIN_INTERVAL_MS = 750;
const MAX_INTERVAL_MS = 3_000;
const ADAPTIVE_BACKOFF_MS = 250;

function hashOutput(rows: RunOutputRow[]): string {
  let hash = 0;
  for (const row of rows) {
    const line = `${String(row.id)}:${row.source}:${row.line}`;
    for (const char of line) {
      hash = (hash << 5) - hash + char.charCodeAt(0);
      hash |= 0;
    }
  }
  return String(hash);
}

export function useRunOutput(
  runId: number | null,
  intervalMs = 400,
  limit = 120,
): RunOutputRow[] {
  const baseIntervalMs = Math.max(intervalMs, MIN_INTERVAL_MS);
  const [output, setOutput] = useState<RunOutputRow[]>([]);
  const lastHashRef = useRef<string>('');
  const currentIntervalRef = useRef<number>(baseIntervalMs);

  const refresh = useCallback((): void => {
    if (runId === null) {
      if (output.length > 0) {
        setOutput([]);
      }
      lastHashRef.current = '';
      return;
    }
    try {
      const rows = listRunOutput(runId, limit);
      const hash = hashOutput(rows);
      if (hash !== lastHashRef.current) {
        lastHashRef.current = hash;
        setOutput(rows);
        currentIntervalRef.current = baseIntervalMs;
      } else if (currentIntervalRef.current < MAX_INTERVAL_MS) {
        currentIntervalRef.current = Math.min(
          MAX_INTERVAL_MS,
          currentIntervalRef.current + ADAPTIVE_BACKOFF_MS,
        );
      }
    } catch (error) {
      // DB locked or unavailable — keep stale data
      logCaughtError('useRunOutput.refresh', error);
    }
  }, [baseIntervalMs, limit, output.length, runId]);

  useEffect(() => {
    currentIntervalRef.current = baseIntervalMs;
  }, [baseIntervalMs, runId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (runId === null) return undefined;

    let timer: NodeJS.Timeout | null = null;
    const schedule = (): void => {
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, currentIntervalRef.current);
    };
    schedule();

    const maybeRefresh = (eventRunId: number): void => {
      if (eventRunId !== runId) return;
      currentIntervalRef.current = baseIntervalMs;
      queueMicrotask(refresh);
    };

    const unsubscribers = [
      msqEventBus.subscribe('run:output', (event) => {
        maybeRefresh(event.runId);
      }),
      msqEventBus.subscribe('run:done', (event) => {
        maybeRefresh(event.runId);
      }),
      msqEventBus.subscribe('run:failed', (event) => {
        maybeRefresh(event.runId);
      }),
    ];
    return (): void => {
      if (timer) clearTimeout(timer);
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [baseIntervalMs, refresh, runId]);

  return output;
}
