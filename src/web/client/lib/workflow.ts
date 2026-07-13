import type { TaskRun } from '../../../db/repo.js';

const STAGE_ORDER = ['specify', 'plan', 'tasks', 'implement', 'validate'];

const TASK_STATUS_ORDER: Record<TaskRun['status'], number> = {
  running: 0,
  blocked: 1,
  failed: 2,
  pending: 3,
  done: 4,
  skipped: 5,
};

export interface StageGroup {
  stage: string;
  tasks: TaskRun[];
  total: number;
  totalTokens: number;
  maxContextPercent: number | null;
  done: number;
  running: number;
  failed: number;
  blocked: number;
  pending: number;
  skipped: number;
}

function stageOrder(stage: string, stages: string[]): number {
  const index = stages.indexOf(stage);
  return index === -1 ? stages.length : index;
}

function taskOrder(status: TaskRun['status']): number {
  return TASK_STATUS_ORDER[status];
}

export function summarizeTaskRuns(taskRuns: TaskRun[], stages: string[] = STAGE_ORDER): StageGroup[] {
  const groups = new Map<string, TaskRun[]>();

  for (const task of taskRuns) {
    const key = task.stage ?? 'ungrouped';
    const current = groups.get(key) ?? [];
    current.push(task);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => stageOrder(left, stages) - stageOrder(right, stages) || left.localeCompare(right))
    .map(([stage, tasks]) => {
      const orderedTasks = [...tasks].sort(
        (left, right) =>
          taskOrder(left.status) - taskOrder(right.status) ||
          (left.startedAt ?? '').localeCompare(right.startedAt ?? '') ||
          left.id - right.id ||
          left.title.localeCompare(right.title),
      );

      return {
        stage,
        tasks: orderedTasks,
        total: orderedTasks.length,
        totalTokens: orderedTasks.reduce((sum, task) => sum + (task.totalTokens ?? 0), 0),
        maxContextPercent: orderedTasks.reduce<number | null>((max, task) => {
          const value = task.contextWindowPercent ?? null;
          if (value === null) return max;
          return max === null ? value : Math.max(max, value);
        }, null),
        done: orderedTasks.filter((task) => task.status === 'done').length,
        running: orderedTasks.filter((task) => task.status === 'running').length,
        failed: orderedTasks.filter((task) => task.status === 'failed').length,
        blocked: orderedTasks.filter((task) => task.status === 'blocked').length,
        pending: orderedTasks.filter((task) => task.status === 'pending').length,
        skipped: orderedTasks.filter((task) => task.status === 'skipped').length,
      };
    });
}
