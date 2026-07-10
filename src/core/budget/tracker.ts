import type { TokenUsage } from '../adapters/types.js';
import type { Budget } from '../backlog/schema.js';
import type { Config } from '../../config/index.js';

export interface BudgetLimits {
  maxTokens?: number;
  perFeatureMaxTokens?: number;
  alertAtPercent: number;
}

export interface BudgetViolation {
  scope: 'global' | 'feature';
  kind: 'tokens';
  featureId?: string;
  spent: number;
  limit: number;
}

export interface BudgetAlert {
  kind: 'tokens';
  percent: number;
  spent: number;
  limit: number;
}

export interface BudgetRecordResult {
  violations: BudgetViolation[];
  alerts: BudgetAlert[];
}

export interface BudgetTracker {
  record(featureId: string, usage: TokenUsage): BudgetRecordResult;
  globalViolation(): BudgetViolation | null;
  totalTokens(): number;
  hasLimits(): boolean;
}

export interface BudgetTrackerPersistence {
  config: Config;
  saveConfig: (cfg: Config) => void;
  loadState: (key: string) => number | null;
  saveState: (key: string, tokens: number) => void;
}

export function resolveBudgetLimits(
  backlogBudget: Budget | undefined,
  configBudget: { alertAtPercent?: number } | undefined,
): BudgetLimits {
  return {
    maxTokens: backlogBudget?.maxTokens,
    perFeatureMaxTokens: backlogBudget?.perFeatureMaxTokens,
    alertAtPercent: configBudget?.alertAtPercent ?? 80,
  };
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createBudgetTracker(
  limits: BudgetLimits,
  persistence?: BudgetTrackerPersistence,
): BudgetTracker {
  let tokens = 0;
  const perFeatureTokens = new Map<string, number>();
  const alerted = new Set<'tokens'>();
  const featureViolationsReported = new Set<string>();

  if (persistence) {
    const today = todayString();
    const lastReset = persistence.config.budget.lastResetDate;

    if (lastReset !== today) {
      tokens = 0;
      perFeatureTokens.clear();
      alerted.clear();
      featureViolationsReported.clear();
      persistence.config.budget.lastResetDate = today;
      persistence.saveConfig(persistence.config);
      persistence.saveState('global', 0);
    } else {
      const persisted = persistence.loadState('global');
      if (persisted !== null) {
        tokens = persisted;
      }
    }
  }

  const hasLimits = (): boolean =>
    limits.maxTokens !== undefined
    || limits.perFeatureMaxTokens !== undefined;

  const globalViolation = (): BudgetViolation | null => {
    if (limits.maxTokens !== undefined && tokens >= limits.maxTokens) {
      return { scope: 'global', kind: 'tokens', spent: tokens, limit: limits.maxTokens };
    }
    return null;
  };

  const collectAlerts = (): BudgetAlert[] => {
    const alerts: BudgetAlert[] = [];
    if (limits.maxTokens !== undefined && !alerted.has('tokens')) {
      const percent = Math.floor((tokens / limits.maxTokens) * 100);
      if (percent >= limits.alertAtPercent) {
        alerted.add('tokens');
        alerts.push({ kind: 'tokens', percent: Math.min(percent, 100), spent: tokens, limit: limits.maxTokens });
      }
    }
    return alerts;
  };

  return {
    record(featureId, usage): BudgetRecordResult {
      tokens += usage.total;
      const featureTotal = (perFeatureTokens.get(featureId) ?? 0) + usage.total;
      perFeatureTokens.set(featureId, featureTotal);

      if (persistence) {
        persistence.saveState('global', tokens);
        persistence.saveState(`feature:${featureId}`, featureTotal);
      }

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
    hasLimits,
  };
}

export function formatBudgetViolation(violation: BudgetViolation): string {
  const spent = `${String(violation.spent)} tokens`;
  const limit = `${String(violation.limit)} tokens`;
  const scope = violation.scope === 'feature' ? `feature ${violation.featureId ?? ''}` : 'pipeline';
  return `budget exceeded for ${scope}: ${spent} >= ${limit}`;
}
