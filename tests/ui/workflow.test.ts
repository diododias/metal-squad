import { describe, expect, it } from 'vitest';
import { summarizeTaskRuns } from '../../src/ui/workflow.js';
import type { TaskRun } from '../../src/db/repo.js';

function task(overrides: Partial<TaskRun> & Pick<TaskRun, 'id' | 'stage'>): TaskRun {
  return {
    runId: 1,
    taskId: `t${overrides.id}`,
    title: `Task ${overrides.id}`,
    status: 'pending',
    startedAt: null,
    endedAt: null,
    ...overrides,
  };
}

describe('summarizeTaskRuns', () => {
  it('orders stages by the canonical default when no custom stages are passed', () => {
    const tasks = [
      task({ id: 1, stage: 'implement' }),
      task({ id: 2, stage: 'specify' }),
      task({ id: 3, stage: 'plan' }),
    ];
    const summary = summarizeTaskRuns(tasks);
    expect(summary.map((s) => s.stage)).toEqual(['specify', 'plan', 'implement']);
  });

  // F31 item 4: a feature that customizes workflow.stages must have that
  // exact order reflected here — otherwise a stage outside the hardcoded
  // default stage order falls to `length` and desyncs from the stepper reading the
  // same feature's declared stages.
  it('orders stages by the custom order passed in, not the canonical default', () => {
    const tasks = [
      task({ id: 1, stage: 'review' }),
      task({ id: 2, stage: 'draft' }),
      task({ id: 3, stage: 'ship' }),
    ];
    const summary = summarizeTaskRuns(tasks, ['draft', 'review', 'ship']);
    expect(summary.map((s) => s.stage)).toEqual(['draft', 'review', 'ship']);
  });

  it('does not lose or misorder a stage outside the custom list', () => {
    const tasks = [
      task({ id: 1, stage: 'draft' }),
      task({ id: 2, stage: 'unlisted' }),
      task({ id: 3, stage: 'ship' }),
    ];
    const summary = summarizeTaskRuns(tasks, ['draft', 'ship']);
    // 'unlisted' isn't in the custom order — it should still appear, sorted
    // after every declared stage rather than silently dropped.
    expect(summary.map((s) => s.stage)).toEqual(['draft', 'ship', 'unlisted']);
  });

  it('aggregates per-stage counts correctly regardless of stage order source', () => {
    const tasks = [
      task({ id: 1, stage: 'plan', status: 'done' }),
      task({ id: 2, stage: 'plan', status: 'running' }),
      task({ id: 3, stage: 'plan', status: 'failed' }),
    ];
    const [summary] = summarizeTaskRuns(tasks, ['plan']);
    expect(summary).toMatchObject({ stage: 'plan', total: 3, done: 1, running: 1, failed: 1 });
  });
});
