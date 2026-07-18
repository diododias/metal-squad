import type { TaskRun } from '../db/repo.js';
import { STAGE_ORDER } from '../core/workflow/stageOrder.js';

// F31 item 4: fallback default only — matches WorkflowSchema's own default
// `stages` (schema.ts). Features that declare a custom `workflow.stages`
// must have that order passed in explicitly (see summarizeTaskRuns below),
// otherwise a stage outside the default list fell to `length` and could
// desync from the stepper, which reads the same feature's declared stages.

export interface WorkflowStageSummary {
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

function stageOrder(stage: string | null, stages: readonly string[]): number {
  if (!stage) return stages.length + 1;
  const index = stages.indexOf(stage);
  return index === -1 ? stages.length : index;
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

export function summarizeTaskRuns(taskRuns: TaskRun[], stages: readonly string[] = STAGE_ORDER): WorkflowStageSummary[] {
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
      const orderedTasks = [...tasks].sort((left, right) =>
        taskOrder(left.status) - taskOrder(right.status)
        || (left.startedAt ?? '').localeCompare(right.startedAt ?? '')
        || left.id - right.id
        || left.title.localeCompare(right.title));

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
