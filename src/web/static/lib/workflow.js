const STAGE_ORDER = ['specify', 'plan', 'tasks', 'implement', 'validate'];

const TASK_STATUS_ORDER = {
  running: 0,
  blocked: 1,
  failed: 2,
  pending: 3,
  done: 4,
  skipped: 5,
};

function stageOrder(stage, stages) {
  if (!stage) return stages.length + 1;
  const index = stages.indexOf(stage);
  return index === -1 ? stages.length : index;
}

function taskOrder(status) {
  return TASK_STATUS_ORDER[status] ?? 6;
}

export function summarizeTaskRuns(taskRuns, stages = STAGE_ORDER) {
  const groups = new Map();

  for (const task of taskRuns) {
    const key = task.stage ?? 'ungrouped';
    const current = groups.get(key) ?? [];
    current.push(task);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .sort(([left, _leftTasks], [right, _rightTasks]) =>
      stageOrder(left, stages) - stageOrder(right, stages) || left.localeCompare(right))
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
        maxContextPercent: orderedTasks.reduce((max, task) => {
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
