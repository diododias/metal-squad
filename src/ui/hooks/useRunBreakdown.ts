import { useCallback, useEffect, useState } from 'react';
import { listRunEvents } from '../../db/repo.js';
import { computeRunBreakdown, type RunBreakdown } from '../../core/stats.js';

export function useRunBreakdown(
  runId: number | null,
  startedAt: string | null,
  endedAt: string | null,
  intervalMs = 2000,
): RunBreakdown | null {
  const [breakdown, setBreakdown] = useState<RunBreakdown | null>(null);

  const refresh = useCallback((): void => {
    if (runId === null || startedAt === null) {
      setBreakdown(null);
      return;
    }
    try {
      setBreakdown(computeRunBreakdown(listRunEvents(runId), startedAt, endedAt));
    } catch {
      // DB locked or unavailable — keep stale data
    }
  }, [endedAt, runId, startedAt]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (runId === null || endedAt !== null) return undefined;
    const timer = setInterval(refresh, intervalMs);
    return (): void => { clearInterval(timer); };
  }, [endedAt, intervalMs, refresh, runId]);

  return breakdown;
}
