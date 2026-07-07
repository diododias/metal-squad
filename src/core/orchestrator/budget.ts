import type { TokenUsage } from '../adapters/types.js';
import type { Budget } from '../backlog/schema.js';
import { estimateCost } from '../pricing.js';
import { msqEventBus } from '../events/index.js';
import type { BudgetAlertEvent } from '../events/types.js';

export interface BudgetLimits {
  maxTokens?: number;
  maxCostUsd?: number;
  perFeatureMaxTokens?: number;
}

export interface BudgetStatus {
  totalTokens: number;
  totalCostUsd: number;
  limits: BudgetLimits;
}

export interface BudgetTracker {
  /** Accumulates usage for a finished run and emits alerts when thresholds are crossed. */
  recordUsage(featureId: string, usage: TokenUsage, modelOrTool: string): void;
  /** True when the global budget (tokens or cost) is exhausted. */
  exceeded(): boolean;
  /** True when a specific feature spent more tokens than perFeatureMaxTokens. */
  featureExceeded(featureId: string): boolean;
  status(): BudgetStatus;
}

export interface CreateBudgetTrackerOptions {
  /** Percent (1-100) of any limit at which a budget:alert is emitted. */
  alertAtPercent?: number;
  /** Event emitter override for tests. Defaults to the global msq event bus. */
  emit?: (event: BudgetAlertEvent) => void;
}

/**
 * Merges the backlog budget block with the global config fallback.
 * Returns null when no limit is configured (budget tracking disabled).
 */
export function resolveBudgetLimits(
  backlogBudget: Budget | undefined,
  defaultMaxCostUsd: number | undefined,
): BudgetLimits | null {
  const limits: BudgetLimits = {
    maxTokens: backlogBudget?.maxTokens,
    maxCostUsd: backlogBudget?.maxCostUsd ?? defaultMaxCostUsd,
    perFeatureMaxTokens: backlogBudget?.perFeatureMaxTokens,
  };
  if (!limits.maxTokens && !limits.maxCostUsd && !limits.perFeatureMaxTokens) return null;
  return limits;
}

export function createBudgetTracker(
  limits: BudgetLimits,
  opts: CreateBudgetTrackerOptions = {},
): BudgetTracker {
  const alertAtPercent = opts.alertAtPercent ?? 80;
  const emit = opts.emit ?? ((event: BudgetAlertEvent) => msqEventBus.emit('budget:alert', event));

  let totalTokens = 0;
  let totalCostUsd = 0;
  const perFeatureTokens = new Map<string, number>();

  // One alert per dimension per level (threshold / exceeded) to avoid spam.
  const alerted = new Set<string>();

  const maybeAlert = (dimension: string, spent: number, limit: number | undefined): void => {
    if (!limit || limit <= 0) return;
    const percent = Math.floor((spent / limit) * 100);
    if (percent >= 100 && !alerted.has(`${dimension}:exceeded`)) {
      alerted.add(`${dimension}:exceeded`);
      alerted.add(`${dimension}:threshold`);
      emit({ percent, spent: round(spent), limit });
      return;
    }
    if (percent >= alertAtPercent && percent < 100 && !alerted.has(`${dimension}:threshold`)) {
      alerted.add(`${dimension}:threshold`);
      emit({ percent, spent: round(spent), limit });
    }
  };

  return {
    recordUsage(featureId, usage, modelOrTool) {
      totalTokens += usage.total;
      totalCostUsd += estimateCost(
        usage.input,
        usage.cachedInput ?? null,
        usage.output,
        modelOrTool,
      ) ?? 0;
      const featureTotal = (perFeatureTokens.get(featureId) ?? 0) + usage.total;
      perFeatureTokens.set(featureId, featureTotal);

      maybeAlert('tokens', totalTokens, limits.maxTokens);
      maybeAlert('cost', totalCostUsd, limits.maxCostUsd);
      maybeAlert(`feature:${featureId}`, featureTotal, limits.perFeatureMaxTokens);
    },
    exceeded() {
      if (limits.maxTokens && totalTokens >= limits.maxTokens) return true;
      if (limits.maxCostUsd && totalCostUsd >= limits.maxCostUsd) return true;
      return false;
    },
    featureExceeded(featureId) {
      if (!limits.perFeatureMaxTokens) return false;
      return (perFeatureTokens.get(featureId) ?? 0) >= limits.perFeatureMaxTokens;
    },
    status() {
      return { totalTokens, totalCostUsd: round(totalCostUsd), limits };
    },
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
