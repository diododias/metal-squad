import { useCallback, useEffect, useState } from 'react';
import { listRunOutput, type RunOutputRow } from '../../db/repo.js';
import { msqEventBus } from '../../core/events/index.js';

export function useRunOutput(
  runId: number | null,
  intervalMs = 400,
  limit = 120,
): RunOutputRow[] {
  const [output, setOutput] = useState<RunOutputRow[]>([]);

  const refresh = useCallback((): void => {
    if (runId === null) {
      setOutput([]);
      return;
    }
    try {
      setOutput(listRunOutput(runId, limit));
    } catch {
      // DB locked or unavailable — keep stale data
    }
  }, [limit, runId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (runId === null) return undefined;

    void intervalMs;

    const maybeRefresh = (eventRunId: number): void => {
      if (eventRunId !== runId) return;
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
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [intervalMs, refresh, runId]);

  return output;
}
