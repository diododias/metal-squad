import { useEffect, useState } from 'react';
import { listRunsForStats, type StatsRunRow } from '../../db/repo.js';

export function useStatsRows(
  enabled: boolean,
  sinceDays: number | null,
  intervalMs = 3000,
): StatsRunRow[] {
  const [rows, setRows] = useState<StatsRunRow[]>([]);

  useEffect(() => {
    if (!enabled) return undefined;
    const refresh = (): void => {
      try {
        setRows(listRunsForStats(sinceDays !== null ? { sinceDays } : {}));
      } catch {
        // DB locked or unavailable — keep stale data
      }
    };
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return (): void => { clearInterval(timer); };
  }, [enabled, intervalMs, sinceDays]);

  return rows;
}
