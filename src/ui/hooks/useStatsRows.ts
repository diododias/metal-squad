import { useEffect, useState } from 'react';
import { listRunsForStats, type StatsRunRow } from '../../db/repo.js';
import { logCaughtError } from '../../core/events/index.js';

export function useStatsRows(
  enabled: boolean,
  sinceDays: number | null,
  intervalMs = 3000,
): { rows: StatsRunRow[]; error: string | null } {
  const [rows, setRows] = useState<StatsRunRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const refresh = (): void => {
      try {
        setRows(listRunsForStats(sinceDays !== null ? { sinceDays } : {}));
        setError(null);
      } catch (caught) {
        logCaughtError('useStatsRows.refresh', caught);
        setError(caught instanceof Error ? caught.message : 'Failed to refresh stats');
      }
    };
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return (): void => { clearInterval(timer); };
  }, [enabled, intervalMs, sinceDays]);

  return { rows, error };
}
