import type { TokenUsage } from '../adapters/types.js';
import type { Budget } from '../backlog/schema.js';
import { estimateUsageCost } from './pricing.js';

export interface BudgetLimits {
  maxTokens?: number;
  maxCostUsd?: number;
  perFeatureMaxTokens?: number;
  alertAtPercent: number;
}

export interface BudgetViolation {
  scope: 'global' | 'feature';
  kind: 'tokens' | 'cost';
  featureId?: string;
  spent: number;
  limit: number;
}

export interface BudgetAlert {
  kind: 'tokens' | 'cost';
  percent: number;
  spent: number;
  limit: number;
}

export interface BudgetRecordResult {
  violations: BudgetViolation[];
  alerts: BudgetAlert[];
}

export interface BudgetTracker {
  /** Registra o uso de uma run e retorna violacoes/alertas disparados por ela. */
  record(featureId: string, usage: TokenUsage, modelOrTool: string): BudgetRecordResult;
  /** Violacao global corrente (tokens ou custo), se o budget ja estourou. */
  globalViolation(): BudgetViolation | null;
  totalTokens(): number;
  totalCostUsd(): number;
  hasLimits(): boolean;
}

export function resolveBudgetLimits(
  backlogBudget: Budget | undefined,
  configBudget: { defaultMaxCostUsd?: number; alertAtPercent?: number } | undefined,
): BudgetLimits {
  return {
    maxTokens: backlogBudget?.maxTokens,
    maxCostUsd: backlogBudget?.maxCostUsd ?? configBudget?.defaultMaxCostUsd,
    perFeatureMaxTokens: backlogBudget?.perFeatureMaxTokens,
    alertAtPercent: configBudget?.alertAtPercent ?? 80,
  };
}

export function createBudgetTracker(limits: BudgetLimits): BudgetTracker {
  let tokens = 0;
  let costUsd = 0;
  const perFeatureTokens = new Map<string, number>();
  const alerted = new Set<'tokens' | 'cost'>();
  const featureViolationsReported = new Set<string>();

  const hasLimits = (): boolean =>
    limits.maxTokens !== undefined
    || limits.maxCostUsd !== undefined
    || limits.perFeatureMaxTokens !== undefined;

  const globalViolation = (): BudgetViolation | null => {
    if (limits.maxTokens !== undefined && tokens >= limits.maxTokens) {
      return { scope: 'global', kind: 'tokens', spent: tokens, limit: limits.maxTokens };
    }
    if (limits.maxCostUsd !== undefined && costUsd >= limits.maxCostUsd) {
      return { scope: 'global', kind: 'cost', spent: costUsd, limit: limits.maxCostUsd };
    }
    return null;
  };

  const collectAlerts = (): BudgetAlert[] => {
    const alerts: BudgetAlert[] = [];
    const candidates: Array<{ kind: 'tokens' | 'cost'; spent: number; limit?: number }> = [
      { kind: 'tokens', spent: tokens, limit: limits.maxTokens },
      { kind: 'cost', spent: costUsd, limit: limits.maxCostUsd },
    ];
    for (const { kind, spent, limit } of candidates) {
      if (limit === undefined || alerted.has(kind)) continue;
      const percent = Math.floor((spent / limit) * 100);
      if (percent >= limits.alertAtPercent) {
        alerted.add(kind);
        alerts.push({ kind, percent: Math.min(percent, 100), spent, limit });
      }
    }
    return alerts;
  };

  return {
    record(featureId, usage, modelOrTool) {
      tokens += usage.total;
      costUsd += estimateUsageCost(usage, modelOrTool);
      const featureTotal = (perFeatureTokens.get(featureId) ?? 0) + usage.total;
      perFeatureTokens.set(featureId, featureTotal);

      const violations: BudgetViolation[] = [];
      const global = globalViolation();
      if (global) violations.push(global);
      if (
        limits.perFeatureMaxTokens !== undefined
        && featureTotal >= limits.perFeatureMaxTokens
        && !featureViolationsReported.has(featureId)
      ) {
        featureViolationsReported.add(featureId);
        violations.push({
          scope: 'feature',
          kind: 'tokens',
          featureId,
          spent: featureTotal,
          limit: limits.perFeatureMaxTokens,
        });
      }

      return { violations, alerts: collectAlerts() };
    },
    globalViolation,
    totalTokens: () => tokens,
    totalCostUsd: () => costUsd,
    hasLimits,
  };
}

export function formatBudgetViolation(violation: BudgetViolation): string {
  const spent = violation.kind === 'cost' ? `$${violation.spent.toFixed(2)}` : `${violation.spent} tokens`;
  const limit = violation.kind === 'cost' ? `$${violation.limit.toFixed(2)}` : `${violation.limit} tokens`;
  const scope = violation.scope === 'feature' ? `feature ${violation.featureId}` : 'pipeline';
  return `budget exceeded for ${scope}: ${spent} >= ${limit}`;
}
