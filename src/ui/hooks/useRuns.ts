import { useState, useEffect } from 'react';
import { listRunsForTui, listTaskRunsForRun, type RunSummary, type TaskRun } from '../../db/repo.js';
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

    const timer = setInterval(refresh, intervalMs);

    const unsubscribers = [
      msqEventBus.subscribe('run:start', refresh),
      msqEventBus.subscribe('run:done', refresh),
      msqEventBus.subscribe('run:failed', refresh),
      msqEventBus.subscribe('tokens:update', refresh),
      msqEventBus.subscribe('gate:created', refresh),
      msqEventBus.subscribe('gate:resolved', refresh),
      msqEventBus.subscribe('stage:request-created', refresh),
      msqEventBus.subscribe('stage:request-resolved', refresh),
    ];
    return () => {
      clearInterval(timer);
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [intervalMs]);

  return runs;
}

export function useTaskRuns(runId: number | null): TaskRun[] {
  const [taskRuns, setTaskRuns] = useState<TaskRun[]>(() => {
    if (runId === null) return [];
    try {
      return listTaskRunsForRun(runId);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (runId === null) {
      setTaskRuns([]);
      return;
    }

    try {
      setTaskRuns(listTaskRunsForRun(runId));
    } catch {
      setTaskRuns([]);
    }

    const refresh = (): void => {
      try {
        setTaskRuns(listTaskRunsForRun(runId));
      } catch {
        // DB locked or unavailable — keep stale data
      }
    };

    const timer = setInterval(refresh, 2000);

    const unsub1 = msqEventBus.subscribe('task:started', (event) => {
      if (event.runId !== runId) return;
      setTaskRuns((prev) => {
        if (prev.some((t) => t.taskId === event.taskId)) return prev;
        const entry: TaskRun = {
          id: 0,
          runId: event.runId,
          taskId: event.taskId,
          title: event.title,
          status: 'running',
          stage: event.stage ?? null,
          startedAt: new Date().toISOString(),
          endedAt: null,
        };
        return [...prev, entry];
      });
    });

    const unsub2 = msqEventBus.subscribe('task:updated', (event) => {
      if (event.runId !== runId) return;
      setTaskRuns((prev) =>
        prev.map((t) =>
          t.taskId === event.taskId
            ? {
                ...t,
                status: event.status,
                stage: event.stage ?? t.stage,
                endedAt: event.endedAt ?? t.endedAt,
              }
            : t,
        ),
      );
    });

    return () => {
      clearInterval(timer);
      unsub1();
      unsub2();
    };
  }, [runId]);

  return taskRuns;
}
