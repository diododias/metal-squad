import { useEffect, useState } from 'react';
import { listRunsForStats } from '../../db/repo.js';
import { DbAccessError } from '../../db/index.js';

/**
 * F31 item 7 / section 1: the header's token figure is the current PERIOD
 * (default 7 days), not all-time — all-time and the per-repo/feature
 * breakdown stay in the Cost Dashboard (`d`). Loading/error are surfaced
 * explicitly (spec: "Estados vazios, loading e erro") instead of silently
 * showing 0, and a DbAccessError never drops the rest of the header — the
 * last known total is kept on screen while `status` flips to 'error'.
 */
export interface TokenStatsState {
  status: 'loading' | 'ready' | 'error';
  totalTokens: number | null;
  error: string | null;
}

export function useTokenStats(sinceDays = 7, intervalMs = 5000): TokenStatsState {
  const [state, setState] = useState<TokenStatsState>({
    status: 'loading',
    totalTokens: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const refresh = (): void => {
      try {
        const rows = listRunsForStats({ sinceDays });
        const totalTokens = rows.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0);
        if (!cancelled) setState({ status: 'ready', totalTokens, error: null });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof DbAccessError ? error.message : 'Failed to load token stats.';
        setState((current) => ({ status: 'error', totalTokens: current.totalTokens, error: message }));
      }
    };

    refresh();
    const timer = setInterval(refresh, intervalMs);
    return (): void => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs, sinceDays]);

  return state;
}
