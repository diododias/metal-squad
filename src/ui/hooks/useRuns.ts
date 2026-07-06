import { useState, useEffect } from 'react';
import { listRunsForTui, type RunSummary } from '../../db/repo.js';
import { msqEventBus } from '../../core/events/index.js';

export function useRuns(intervalMs = 2000): RunSummary[] {
  const [runs, setRuns] = useState<RunSummary[]>(() => {
    try {
      return listRunsForTui();
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const refresh = (): void => {
      try {
        setRuns(listRunsForTui());
      } catch {
        // DB locked or unavailable — keep stale data
      }
    };

    const unsubscribers = [
      msqEventBus.subscribe('run:start', refresh),
      msqEventBus.subscribe('run:done', refresh),
      msqEventBus.subscribe('run:failed', refresh),
      msqEventBus.subscribe('tokens:update', refresh),
      msqEventBus.subscribe('gate:created', refresh),
      msqEventBus.subscribe('gate:resolved', refresh),
    ];
    const id = setInterval(refresh, intervalMs);
    return () => {
      clearInterval(id);
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [intervalMs]);

  return runs;
}
