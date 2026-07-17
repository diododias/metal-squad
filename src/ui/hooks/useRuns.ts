import { useState, useEffect } from 'react';
import {
  listRunningTaskRuns,
  listRunsForTui,
  listTaskRunsForRun,
  type RunningTaskSummary,
  type RunSummary,
  type TaskRun,
} from '../../db/repo.js';
import { msqEventBus, logCaughtError } from '../../core/events/index.js';
import { resolveRepo } from '../../core/repo.js';

export function useRuns(intervalMs = 2000): RunSummary[] {
  const repoId = resolveRepo().repoId;
  const [runs, setRuns] = useState<RunSummary[]>(() => {
    try {
      return listRunsForTui(50, repoId);
    } catch (error) {
      logCaughtError('useRuns.initialRuns', error);
      return [];
    }
  });

  useEffect(() => {
    const refresh = (): void => {
      try {
        setRuns(listRunsForTui(50, repoId));
      } catch (error) {
        // DB locked or unavailable — keep stale data
        logCaughtError('useRuns.refresh', error);
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
    return (): void => {
      clearInterval(timer);
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [intervalMs, repoId]);

  return runs;
}

export function useTaskRuns(runId: number | null): TaskRun[] {
  const [taskRuns, setTaskRuns] = useState<TaskRun[]>(() => {
    if (runId === null) return [];
    try {
      return listTaskRunsForRun(runId);
    } catch (error) {
      logCaughtError('useTaskRuns.initialTaskRuns', error);
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
    } catch (error) {
      logCaughtError('useTaskRuns.onRunIdChange', error);
      setTaskRuns([]);
    }

    const refresh = (): void => {
      try {
        setTaskRuns(listTaskRunsForRun(runId));
      } catch (error) {
        // DB locked or unavailable — keep stale data
        logCaughtError('useTaskRuns.refresh', error);
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
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          contextWindowTokens: null,
          contextWindowPercent: null,
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

    return (): void => {
      clearInterval(timer);
      unsub1();
      unsub2();
    };
  }, [runId]);

  return taskRuns;
}

// C3: cross-run in-progress task feed for the main dashboard (as opposed to
// useTaskRuns above, which is scoped to a single selected run).
export function useRunningTasks(intervalMs = 2000): RunningTaskSummary[] {
  const [runningTasks, setRunningTasks] = useState<RunningTaskSummary[]>(() => {
    try {
      return listRunningTaskRuns(20);
    } catch (error) {
      logCaughtError('useRunningTasks.initialRunningTasks', error);
      return [];
    }
  });

  useEffect(() => {
    const refresh = (): void => {
      try {
        setRunningTasks(listRunningTaskRuns(20));
      } catch (error) {
        // DB locked or unavailable — keep stale data
        logCaughtError('useRunningTasks.refresh', error);
      }
    };

    const timer = setInterval(refresh, intervalMs);

    const unsubscribers = [
      msqEventBus.subscribe('task:started', refresh),
      msqEventBus.subscribe('task:updated', refresh),
      msqEventBus.subscribe('run:start', refresh),
      msqEventBus.subscribe('run:done', refresh),
      msqEventBus.subscribe('run:failed', refresh),
    ];
    return (): void => {
      clearInterval(timer);
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [intervalMs]);

  return runningTasks;
}
