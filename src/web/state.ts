import { basename } from 'node:path';
import {
  listRunsForTui,
  openGates,
  listPendingStageRequests,
  listRunningTaskRuns,
  listRunsForStats,
  type GateRow,
  type StageRequestRow,
  type RunSummary,
  type RunningTaskSummary,
  type StatsRunRow,
} from '../db/repo.js';
import { resolveRepo } from '../core/repo.js';
import { getFeatureCatalog, getPendingFeatures, type FeatureCatalogEntry } from '../ui/catalog.js';
import { getRunGroup, sortRunsByGroup } from '../ui/dashboardGroups.js';
import type { MsqWebState, TokenStats, UiNotification } from './types.js';

const DASHBOARD_PERIODS: { label: string; days: number | null }[] = [
  { label: 'today', days: 1 },
  { label: 'last 7 days', days: 7 },
  { label: 'last 30 days', days: 30 },
  { label: 'all time', days: null },
];

function gateToPendingApproval(gate: GateRow): { kind: 'gate'; id: number; featureId: string; repoId: string; prompt: string; createdAt: string } {
  return {
    kind: 'gate' as const,
    id: gate.id,
    featureId: gate.featureId,
    repoId: gate.repoId,
    prompt: '',
    createdAt: gate.createdAt,
  };
}

function stageRequestToPendingApproval(sr: StageRequestRow): { kind: 'stage'; id: number; featureId: string; repoId: string; prompt: string; createdAt: string } {
  return {
    kind: 'stage' as const,
    id: sr.id,
    featureId: sr.featureId,
    repoId: '',
    prompt: sr.prompt,
    createdAt: sr.createdAt,
  };
}

function collectGates(): MsqWebState['gates'] {
  try {
    const gates = openGates().map(gateToPendingApproval);
    const stageRequests = listPendingStageRequests().map(stageRequestToPendingApproval);
    return [...gates, ...stageRequests];
  } catch {
    return [];
  }
}

function collectRuns(): RunSummary[] {
  try {
    return sortRunsByGroup(listRunsForTui(2000));
  } catch {
    return [];
  }
}

function collectRunningTasks(): RunningTaskSummary[] {
  try {
    return listRunningTaskRuns(50);
  } catch {
    return [];
  }
}

function collectPendingFeatures(runs: RunSummary[]): FeatureCatalogEntry[] {
  try {
    const catalog = getFeatureCatalog();
    const doneFeatureIds = new Set(runs.filter((run) => run.status === 'done').map((run) => run.featureId));
    const activeFeatureIds = new Set(runs.filter((run) => run.status === 'running' || run.status === 'done').map((run) => run.featureId));
    return getPendingFeatures(catalog, doneFeatureIds, activeFeatureIds);
  } catch {
    return [];
  }
}

function computeTokenStats(sinceDays = 7): TokenStats {
  try {
    const rows = listRunsForStats({ sinceDays });
    const totalTokens = rows.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0);
    return { status: 'ready', totalTokens, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load token stats.';
    return { status: 'error', totalTokens: null, error: message };
  }
}

function collectDashboardRows(): StatsRunRow[] {
  try {
    return listRunsForStats({ sinceDays: 7 });
  } catch {
    return [];
  }
}

export function buildMsqWebState(): MsqWebState {
  const repoLabel = basename(resolveRepo().path);
  const runs = collectRuns();
  const gates = collectGates();
  const pendingFeatures = collectPendingFeatures(runs);
  const runningTasks = collectRunningTasks();
  const executionRuns = runs.filter((run) => getRunGroup(run.status) === 'execution');
  const doneRuns = runs.filter((run) => run.status === 'done');
  const falhaRunsList = runs.filter((run) => getRunGroup(run.status) === 'canceled');

  return {
    repoLabel,
    runs,
    gates,
    pendingFeatures,
    runningTasks,
    stats: {
      totalRuns: runs.length,
      doneRuns: doneRuns.length,
      executionCount: executionRuns.length,
      falhaCount: falhaRunsList.length,
      tokenStats: computeTokenStats(7),
    },
    dashboard: {
      periods: DASHBOARD_PERIODS,
      rows: collectDashboardRows(),
    },
    notifications: [],
  };
}

export function appendNotification(
  state: MsqWebState,
  notification: UiNotification,
  maxSize = 40,
): MsqWebState {
  const notifications = [notification, ...state.notifications].slice(0, maxSize);
  return { ...state, notifications };
}
