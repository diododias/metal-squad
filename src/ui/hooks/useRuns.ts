import { useState, useEffect, useCallback } from 'react';
import { listRunsForTui, type RunSummary } from '../../db/repo.js';
import { bus } from '../../core/events/bus.js';

export function useRuns(intervalMs = 2000): RunSummary[] {
  const [runs, setRuns] = useState<RunSummary[]>(() => {
    try {
      return listRunsForTui();
    } catch {
      return [];
    }
  });

  const refresh = useCallback((): void => {
    try {
      setRuns(listRunsForTui());
    } catch {
      // DB locked or unavailable — keep stale data
    }
  }, []);

  useEffect(() => {
    bus.on('run:start', refresh);
    bus.on('run:done', refresh);
    bus.on('run:failed', refresh);
    bus.on('tokens:update', refresh);
    const id = setInterval(refresh, intervalMs);
    return () => {
      bus.off('run:start', refresh);
      bus.off('run:done', refresh);
      bus.off('run:failed', refresh);
      bus.off('tokens:update', refresh);
      clearInterval(id);
    };
  }, [intervalMs, refresh]);

  return runs;
}
