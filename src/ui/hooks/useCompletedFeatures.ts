import { useState, useEffect } from 'react';
import { listCompletedFeatureIds } from '../../db/repo.js';
import { msqEventBus, logCaughtError } from '../../core/events/index.js';
import { resolveRepo } from '../../core/repo.js';

export function useCompletedFeatures(intervalMs = 2000): { doneFeatureIds: Set<string>; error: string | null } {
  const repoId = resolveRepo().repoId;
  const [doneFeatureIds, setDoneFeatureIds] = useState<Set<string>>(() => {
    try {
      return listCompletedFeatureIds(repoId);
    } catch (error) {
      logCaughtError('useCompletedFeatures.initialFeatures', error);
      return new Set();
    }
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = (): void => {
      try {
        setDoneFeatureIds(listCompletedFeatureIds(repoId));
        setError(null);
      } catch (caught) {
        logCaughtError('useCompletedFeatures.refresh', caught);
        setError(caught instanceof Error ? caught.message : 'Failed to refresh completed features');
      }
    };

    const timer = setInterval(refresh, intervalMs);

    const unsubscribers = [
      msqEventBus.subscribe('run:done', refresh),
      msqEventBus.subscribe('run:failed', refresh),
    ];
    return (): void => {
      clearInterval(timer);
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [intervalMs, repoId]);

  return { doneFeatureIds, error };
}
