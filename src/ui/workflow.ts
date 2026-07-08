import type { TaskRun } from '../db/repo.js';

const STAGE_ORDER = ['specify', 'plan', 'tasks', 'implement', 'validate'];

export interface WorkflowStageSummary {
  stage: string;
  tasks: TaskRun[];
  total: number;
  done: number;
  running: number;
  failed: number;
  blocked: number;
  pending: number;
  skipped: number;
}

function stageOrder(stage: string | null): number {
  if (!stage) return STAGE_ORDER.length + 1;
  const index = STAGE_ORDER.indexOf(stage);
  return index === -1 ? STAGE_ORDER.length : index;
}

function taskOrder(status: TaskRun['status']): number {
  switch (status) {
    case 'running':
      return 0;
    case 'blocked':
      return 1;
    case 'failed':
      return 2;
    case 'pending':
      return 3;
    case 'done':
      return 4;
    case 'skipped':
      return 5;
    default:
      return 6;
  }
}

export function summarizeTaskRuns(taskRuns: TaskRun[]): WorkflowStageSummary[] {
  const groups = new Map<string, TaskRun[]>();

  for (const task of taskRuns) {
    const key = task.stage ?? 'ungrouped';
    const current = groups.get(key) ?? [];
    current.push(task);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => stageOrder(left) - stageOrder(right) || left.localeCompare(right))
    .map(([stage, tasks]) => {
      const orderedTasks = [...tasks].sort((left, right) =>
        taskOrder(left.status) - taskOrder(right.status)
        || (left.startedAt ?? '').localeCompare(right.startedAt ?? '')
        || left.id - right.id
        || left.title.localeCompare(right.title));

      return {
        stage,
        tasks: orderedTasks,
        total: orderedTasks.length,
        done: orderedTasks.filter((task) => task.status === 'done').length,
        running: orderedTasks.filter((task) => task.status === 'running').length,
        failed: orderedTasks.filter((task) => task.status === 'failed').length,
        blocked: orderedTasks.filter((task) => task.status === 'blocked').length,
        pending: orderedTasks.filter((task) => task.status === 'pending').length,
        skipped: orderedTasks.filter((task) => task.status === 'skipped').length,
      };
    });
}
