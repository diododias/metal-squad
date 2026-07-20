import { useCallback, useEffect, useState } from 'react';
import { listRunEvents } from '../../db/repo.js';
import { computeRunBreakdown, type RunBreakdown } from '../../core/stats.js';
import { logCaughtError } from '../../core/events/index.js';

export function useRunBreakdown(
  runId: number | null,
  startedAt: string | null,
  endedAt: string | null,
  intervalMs = 2000,
): { breakdown: RunBreakdown | null; error: string | null } {
  const [breakdown, setBreakdown] = useState<RunBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((): void => {
    if (runId === null || startedAt === null) {
      setBreakdown(null);
      setError(null);
      return;
    }
    try {
      setBreakdown(computeRunBreakdown(listRunEvents(runId), startedAt, endedAt));
      setError(null);
    } catch (caught) {
      logCaughtError('useRunBreakdown.refresh', caught);
      setError(caught instanceof Error ? caught.message : 'Failed to refresh run breakdown');
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

  return { breakdown, error };
}
