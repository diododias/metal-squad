import { describe, expect, it } from 'vitest';
import {
  createBudgetTracker,
  formatBudgetViolation,
  resolveBudgetLimits,
} from '../../src/core/budget/tracker.js';
import { estimateCost, estimateUsageCost } from '../../src/core/budget/pricing.js';
import { BudgetSchema, BacklogV2Schema } from '../../src/core/backlog/schema.js';

const usage = (total: number) => ({ input: total / 2, output: total / 2, total });

describe('budget schema', () => {
  it('accepts budget block in backlog v2', () => {
    const parsed = BacklogV2Schema.parse({
      version: 2,
      repo: 'demo',
      budget: { maxTokens: 500_000, maxCostUsd: 10, perFeatureMaxTokens: 100_000 },
      epics: [],
    });
    expect(parsed.budget?.maxTokens).toBe(500_000);
    expect(parsed.budget?.maxCostUsd).toBe(10);
  });

  it('rejects non-positive limits', () => {
    expect(() => BudgetSchema.parse({ maxTokens: 0 })).toThrow();
    expect(() => BudgetSchema.parse({ maxCostUsd: -1 })).toThrow();
  });
});

describe('resolveBudgetLimits', () => {
  it('prefers backlog budget over config default cost', () => {
    const limits = resolveBudgetLimits(
      { maxCostUsd: 10 },
      { defaultMaxCostUsd: 5, alertAtPercent: 80 },
    );
    expect(limits.maxCostUsd).toBe(10);
  });

  it('falls back to config defaultMaxCostUsd', () => {
    const limits = resolveBudgetLimits(undefined, { defaultMaxCostUsd: 5, alertAtPercent: 80 });
    expect(limits.maxCostUsd).toBe(5);
    expect(limits.maxTokens).toBeUndefined();
  });
});

describe('budget tracker', () => {
  it('reports no violations when under all limits', () => {
    const tracker = createBudgetTracker({ maxTokens: 1000, alertAtPercent: 80 });
    const result = tracker.record('feat-1', usage(100), 'claude');
    expect(result.violations).toEqual([]);
    expect(result.alerts).toEqual([]);
    expect(tracker.globalViolation()).toBeNull();
  });

  it('emits a single alert when crossing the threshold', () => {
    const tracker = createBudgetTracker({ maxTokens: 1000, alertAtPercent: 80 });
    const first = tracker.record('feat-1', usage(800), 'claude');
    expect(first.alerts).toHaveLength(1);
    expect(first.alerts[0]).toMatchObject({ kind: 'tokens', percent: 80, limit: 1000 });
    const second = tracker.record('feat-1', usage(50), 'claude');
    expect(second.alerts).toEqual([]);
  });

  it('flags a global token violation once exceeded', () => {
    const tracker = createBudgetTracker({ maxTokens: 1000, alertAtPercent: 80 });
    const result = tracker.record('feat-1', usage(1200), 'claude');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({ scope: 'global', kind: 'tokens' });
    expect(tracker.globalViolation()).not.toBeNull();
  });

  it('flags cost violations using the pricing table', () => {
    // claude: $3/M in + $15/M out => 1M in + 1M out = $18
    const tracker = createBudgetTracker({ maxCostUsd: 10, alertAtPercent: 80 });
    const result = tracker.record('feat-1', usage(2_000_000), 'claude');
    expect(tracker.totalCostUsd()).toBeCloseTo(18, 5);
    expect(result.violations[0]).toMatchObject({ scope: 'global', kind: 'cost' });
  });

  it('flags per-feature violations only once per feature', () => {
    const tracker = createBudgetTracker({ perFeatureMaxTokens: 500, alertAtPercent: 80 });
    const first = tracker.record('feat-1', usage(600), 'claude');
    expect(first.violations).toHaveLength(1);
    expect(first.violations[0]).toMatchObject({ scope: 'feature', featureId: 'feat-1' });
    const repeat = tracker.record('feat-1', usage(100), 'claude');
    expect(repeat.violations).toEqual([]);
    const other = tracker.record('feat-2', usage(600), 'claude');
    expect(other.violations).toHaveLength(1);
  });

  it('reports hasLimits correctly', () => {
    expect(createBudgetTracker({ alertAtPercent: 80 }).hasLimits()).toBe(false);
    expect(createBudgetTracker({ maxTokens: 1, alertAtPercent: 80 }).hasLimits()).toBe(true);
  });

  it('formats violations for humans', () => {
    expect(formatBudgetViolation({ scope: 'global', kind: 'tokens', spent: 1200, limit: 1000 }))
      .toContain('pipeline');
    expect(formatBudgetViolation({ scope: 'feature', kind: 'tokens', featureId: 'feat-1', spent: 600, limit: 500 }))
      .toContain('feat-1');
  });
});

describe('pricing', () => {
  it('estimates usage cost for known tools', () => {
    expect(estimateUsageCost({ input: 1_000_000, output: 0, total: 1_000_000 }, 'claude')).toBeCloseTo(3);
    expect(estimateCost(null, null, null, 'claude')).toBeNull();
  });
});
