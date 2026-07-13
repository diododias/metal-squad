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
import { getFeatureCatalog, getBacklogSettings, getPendingFeatures, type FeatureCatalogEntry } from '../ui/catalog.js';
import { getRunGroup, sortRunsByGroup } from '../ui/dashboardGroups.js';
import { resolveRuntimeConfig, ConfigSchema, type Config } from '../config/index.js';
import { resolveThemePreference } from '../ui/theme/resolve.js';
import type { ThemeRoleName } from '../ui/theme/types.js';
import { createSkillRegistry } from '../core/skills/registry.js';
import type { Skill } from '../core/skills/types.js';
import type { MsqWebState, ThemeSnapshot, TokenStats, UiNotification } from './types.js';

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
    const activeFeatureIds = new Set(
      runs
        .filter((run) => run.status === 'running' || run.status === 'blocked' || run.status === 'done')
        .map((run) => run.featureId),
    );
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

const FALLBACK_ROLE_COLOR = '#e5e7eb';

function buildThemeSnapshot(): ThemeSnapshot {
  try {
    const config = resolveRuntimeConfig(process.cwd());
    const resolution = resolveThemePreference(config.theme);
    const textColor = resolution.profile.roles.text.color ?? FALLBACK_ROLE_COLOR;
    const roles = Object.fromEntries(
      (Object.entries(resolution.profile.roles) as [ThemeRoleName, { color?: string }][]).map(
        ([role, style]) => [role, style.color ?? textColor],
      ),
    ) as Record<ThemeRoleName, string>;
    return { name: resolution.active, roles };
  } catch {
    return {
      name: 'default',
      roles: {
        text: FALLBACK_ROLE_COLOR,
        primary: '#22d3ee',
        success: '#34d399',
        warning: '#fbbf24',
        error: '#f87171',
        muted: '#9ca3af',
        accent: '#22d3ee',
        focus: '#22d3ee',
      },
    };
  }
}

function collectRuntimeConfig(): Config {
  try {
    return resolveRuntimeConfig(process.cwd());
  } catch {
    return ConfigSchema.parse({});
  }
}

function collectSkillsCatalog(): Skill[] {
  try {
    return createSkillRegistry().discover(process.cwd());
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
  const featureCatalog = getFeatureCatalog();
  const backlogSettings = getBacklogSettings();
  const executionRuns = runs.filter((run) => getRunGroup(run.status) === 'execution');
  const doneRuns = runs.filter((run) => run.status === 'done');
  const falhaRunsList = runs.filter((run) => getRunGroup(run.status) === 'canceled');

  return {
    repoLabel,
    runs,
    gates,
    pendingFeatures,
    runningTasks,
    featureCatalog,
    backlogSettings,
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
    theme: buildThemeSnapshot(),
    runtimeConfig: collectRuntimeConfig(),
    skillsCatalog: collectSkillsCatalog(),
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
