import { describe, expect, it } from 'vitest';
import {
  createBudgetTracker,
  formatBudgetViolation,
  resolveBudgetLimits,
} from '../../src/core/budget/tracker.js';
import { BudgetSchema, BacklogV2Schema } from '../../src/core/backlog/schema.js';

const usage = (total: number) => ({ input: total / 2, output: total / 2, total });

describe('budget schema', () => {
  it('accepts budget block in backlog v2', () => {
    const parsed = BacklogV2Schema.parse({
      version: 2,
      repo: 'demo',
      budget: { maxTokens: 500_000, perFeatureMaxTokens: 100_000 },
      epics: [],
    });
    expect(parsed.budget?.maxTokens).toBe(500_000);
  });

  it('rejects non-positive limits', () => {
    expect(() => BudgetSchema.parse({ maxTokens: 0 })).toThrow();
  });
});

describe('resolveBudgetLimits', () => {
  it('uses backlog budget when provided', () => {
    const limits = resolveBudgetLimits(
      { maxTokens: 1000 },
      { alertAtPercent: 80 },
    );
    expect(limits.maxTokens).toBe(1000);
  });

  it('uses defaults when no backlog budget', () => {
    const limits = resolveBudgetLimits(undefined, { alertAtPercent: 90 });
    expect(limits.maxTokens).toBeUndefined();
    expect(limits.alertAtPercent).toBe(90);
  });

  it('defaults alertAtPercent to 80', () => {
    const limits = resolveBudgetLimits(undefined, undefined);
    expect(limits.alertAtPercent).toBe(80);
  });
});

describe('budget tracker', () => {
  it('reports no violations when under all limits', () => {
    const tracker = createBudgetTracker({ maxTokens: 1000, alertAtPercent: 80 });
    const result = tracker.record('feat-1', usage(100));
    expect(result.violations).toEqual([]);
    expect(result.alerts).toEqual([]);
    expect(tracker.globalViolation()).toBeNull();
  });

  it('emits a single alert when crossing the threshold', () => {
    const tracker = createBudgetTracker({ maxTokens: 1000, alertAtPercent: 80 });
    const first = tracker.record('feat-1', usage(800));
    expect(first.alerts).toHaveLength(1);
    expect(first.alerts[0]).toMatchObject({ kind: 'tokens', percent: 80, limit: 1000 });
    const second = tracker.record('feat-1', usage(50));
    expect(second.alerts).toEqual([]);
  });

  it('flags a global token violation once exceeded', () => {
    const tracker = createBudgetTracker({ maxTokens: 1000, alertAtPercent: 80 });
    const result = tracker.record('feat-1', usage(1200));
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({ scope: 'global', kind: 'tokens' });
    expect(tracker.globalViolation()).not.toBeNull();
  });

  it('flags per-feature violations only once per feature', () => {
    const tracker = createBudgetTracker({ perFeatureMaxTokens: 500, alertAtPercent: 80 });
    const first = tracker.record('feat-1', usage(600));
    expect(first.violations).toHaveLength(1);
    expect(first.violations[0]).toMatchObject({ scope: 'feature', featureId: 'feat-1' });
    const repeat = tracker.record('feat-1', usage(100));
    expect(repeat.violations).toEqual([]);
    const other = tracker.record('feat-2', usage(600));
    expect(other.violations).toHaveLength(1);
  });

  it('a lower per-feature maxTokens override wins over the global perFeatureMaxTokens', () => {
    const tracker = createBudgetTracker(
      { perFeatureMaxTokens: 1000, alertAtPercent: 80 },
      undefined,
      new Map([['feat-1', 200]]),
    );
    const overridden = tracker.record('feat-1', usage(250));
    expect(overridden.violations).toHaveLength(1);
    expect(overridden.violations[0]).toMatchObject({ scope: 'feature', featureId: 'feat-1', limit: 200 });

    const notOverridden = tracker.record('feat-2', usage(250));
    expect(notOverridden.violations).toEqual([]);
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
