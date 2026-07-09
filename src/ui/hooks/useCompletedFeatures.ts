import { useState, useEffect } from 'react';
import { listCompletedFeatureIds } from '../../db/repo.js';
import { msqEventBus } from '../../core/events/index.js';
import { resolveRepo } from '../../core/repo.js';

export function useCompletedFeatures(intervalMs = 2000): Set<string> {
  const repoId = resolveRepo().repoId;
  const [doneFeatureIds, setDoneFeatureIds] = useState<Set<string>>(() => {
    try {
      return listCompletedFeatureIds(repoId);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    const refresh = (): void => {
      try {
        setDoneFeatureIds(listCompletedFeatureIds(repoId));
      } catch {
        // DB locked or unavailable — keep stale data
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

  return doneFeatureIds;
}
