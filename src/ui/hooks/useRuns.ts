import { useState, useEffect } from 'react';
import { listRunsForTui, type RunSummary } from '../../db/repo.js';

export function useRuns(intervalMs = 2000): RunSummary[] {
  const [runs, setRuns] = useState<RunSummary[]>(() => {
    try {
      return listRunsForTui();
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const tick = (): void => {
      try {
        setRuns(listRunsForTui());
      } catch {
        // DB locked or unavailable — keep stale data
      }
    };

    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return runs;
}
