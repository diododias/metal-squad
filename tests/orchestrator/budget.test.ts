import { describe, expect, it } from 'vitest';
import {
  createBudgetTracker,
  resolveBudgetLimits,
} from '../../src/core/orchestrator/budget.js';
import type { BudgetAlertEvent } from '../../src/core/events/types.js';
import { schedule } from '../../src/core/orchestrator/scheduler.js';
import type { Feature } from '../../src/core/backlog/schema.js';

function usage(input: number, output: number) {
  return { input, output, total: input + output };
}

function collectAlerts(): { events: BudgetAlertEvent[]; emit: (e: BudgetAlertEvent) => void } {
  const events: BudgetAlertEvent[] = [];
  return { events, emit: (e) => events.push(e) };
}

describe('resolveBudgetLimits', () => {
  it('returns null when nothing is configured', () => {
    expect(resolveBudgetLimits(undefined, undefined)).toBeNull();
  });

  it('falls back to config defaultMaxCostUsd when backlog has no maxCostUsd', () => {
    expect(resolveBudgetLimits(undefined, 5)).toEqual({
      maxTokens: undefined,
      maxCostUsd: 5,
      perFeatureMaxTokens: undefined,
    });
  });

  it('prefers backlog maxCostUsd over the config default', () => {
    expect(resolveBudgetLimits({ maxCostUsd: 10 }, 5)?.maxCostUsd).toBe(10);
  });
});

describe('createBudgetTracker', () => {
  it('accumulates tokens and estimated cost', () => {
    const tracker = createBudgetTracker({ maxTokens: 1_000_000 });
    tracker.recordUsage('feat-01', usage(1000, 500), 'claude');
    tracker.recordUsage('feat-02', usage(2000, 1000), 'claude');
    const status = tracker.status();
    expect(status.totalTokens).toBe(4500);
    // claude: $3/M input, $15/M output → (3000*3 + 1500*15) / 1M
    expect(status.totalCostUsd).toBeCloseTo(0.0315, 4);
  });

  it('emits a single alert when crossing the threshold percent', () => {
    const { events, emit } = collectAlerts();
    const tracker = createBudgetTracker({ maxTokens: 1000 }, { alertAtPercent: 80, emit });

    tracker.recordUsage('feat-01', usage(500, 300), 'claude'); // 80%
    tracker.recordUsage('feat-01', usage(50, 0), 'claude'); // 85%, no repeat

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ percent: 80, spent: 800, limit: 1000 });
  });

  it('emits again when the budget is exceeded and reports exceeded()', () => {
    const { events, emit } = collectAlerts();
    const tracker = createBudgetTracker({ maxTokens: 1000 }, { alertAtPercent: 80, emit });

    tracker.recordUsage('feat-01', usage(500, 300), 'claude'); // 80%
    expect(tracker.exceeded()).toBe(false);
    tracker.recordUsage('feat-01', usage(200, 100), 'claude'); // 110%

    expect(events).toHaveLength(2);
    expect(events[1]!.percent).toBeGreaterThanOrEqual(100);
    expect(tracker.exceeded()).toBe(true);
  });

  it('enforces maxCostUsd independently of maxTokens', () => {
    const { emit } = collectAlerts();
    // claude output $15/M → 1M output tokens = $15
    const tracker = createBudgetTracker({ maxCostUsd: 10 }, { emit });
    tracker.recordUsage('feat-01', usage(0, 1_000_000), 'claude');
    expect(tracker.exceeded()).toBe(true);
  });

  it('tracks per-feature token budget separately', () => {
    const { emit } = collectAlerts();
    const tracker = createBudgetTracker({ perFeatureMaxTokens: 1000 }, { emit });
    tracker.recordUsage('feat-01', usage(800, 300), 'claude');
    tracker.recordUsage('feat-02', usage(100, 100), 'claude');

    expect(tracker.featureExceeded('feat-01')).toBe(true);
    expect(tracker.featureExceeded('feat-02')).toBe(false);
    expect(tracker.exceeded()).toBe(false); // no global limit configured
  });
});

describe('schedule beforeDispatch', () => {
  function feature(id: string, dependsOn: string[] = []): Feature {
    return {
      id,
      title: id,
      tool: 'claude',
      effort: 'medium',
      dependsOn,
      tasks: [],
    } as unknown as Feature;
  }

  it('pauses instead of dispatching when beforeDispatch returns false', async () => {
    const executed: string[] = [];
    let allow = true;
    const states: string[] = [];

    const controller = schedule([feature('feat-01'), feature('feat-02')], {
      concurrency: 1,
      beforeDispatch: () => allow,
      onStateChange: (state) => states.push(state),
      execute: async (item) => {
        executed.push(item.id);
        allow = false; // budget exhausted after the first feature
        return { ok: true, summary: item.id };
      },
    });

    // Wait until the scheduler auto-pauses after feat-01.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(executed).toEqual(['feat-01']);
    expect(controller.getState()).toBe('paused');
    expect(states).toContain('paused');

    // Resuming re-checks the budget; once allowed again, execution continues.
    allow = true;
    controller.resume();
    await controller.result;
    expect(executed).toEqual(['feat-01', 'feat-02']);
  });
});
