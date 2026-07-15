import { basename } from 'node:path';
import {
  listRunsForTui,
  listCompletedFeatureIds,
  openGates,
  listPendingStageRequests,
  listRunningTaskRuns,
  listPendingTimeoutApprovalRequests,
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
import type { MsqWebState, ThemeSnapshot, TimeoutApprovalState, TokenStats, UiNotification, WebRuntimeConfig } from './types.js';

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

function stageRequestToPendingApproval(sr: StageRequestRow): { kind: 'stage'; id: number; featureId: string; repoId: string; prompt: string; createdAt: string; requestKind: 'approval' | 'input'; options?: string[] } {
  return {
    kind: 'stage' as const,
    id: sr.id,
    featureId: sr.featureId,
    repoId: '',
    prompt: sr.prompt,
    createdAt: sr.createdAt,
    requestKind: sr.kind,
    options: sr.options ?? undefined,
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

function collectTimeoutApprovals(): TimeoutApprovalState[] {
  try {
    return listPendingTimeoutApprovalRequests().map((request) => ({
      requestId: request.id,
      occurrenceId: request.timeoutOccurrenceId,
      runId: request.runId,
      pipelineId: request.pipelineId,
      featureId: request.featureId,
      stage: request.stage,
      status: request.status,
      notificationStatus: request.notificationStatus,
      notificationAttempts: request.notificationAttempts,
      createdAt: request.createdAt,
    }));
  } catch {
    return [];
  }
}

function collectPendingFeatures(runs: RunSummary[], repoId: string): FeatureCatalogEntry[] {
  try {
    const catalog = getFeatureCatalog();
    const doneFeatureIds = listCompletedFeatureIds(repoId);
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

function normalizeFeatureCatalog(catalog: Record<string, FeatureCatalogEntry>): Record<string, FeatureCatalogEntry> {
  return Object.fromEntries(
    Object.entries(catalog).map(([key, feature]) => [
      key,
      { ...feature, persistedId: feature.persistedId ?? feature.id },
    ]),
  );
}

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

/** Strips notification credentials (Slack/Discord/webhook URLs, Telegram chat
 * id) before the config crosses the WebSocket boundary — with auth 'none' any
 * local process can read the state broadcast. */
export function sanitizeRuntimeConfig(config: Config): WebRuntimeConfig {
  const { telegramChatId: _telegramChatId, notifications, ...rest } = config;
  return {
    ...rest,
    notifications: {
      channels: notifications.channels.map((channel) => ({ type: channel.type })),
      events: notifications.events,
    },
  };
}

// Config resolution re-reads config files and skill discovery walks the
// filesystem; the web server rebuilds state every second while a client is
// connected, so both are cached with a TTL instead of recomputed per tick.
const CONFIG_CACHE_TTL_MS = 30_000;
let runtimeConfigCache: { value: WebRuntimeConfig; expiresAt: number } | null = null;
let skillsCatalogCache: { value: Skill[]; expiresAt: number } | null = null;

/** Test hook: drop the runtime-config/skills caches. */
export function resetWebStateCaches(): void {
  runtimeConfigCache = null;
  skillsCatalogCache = null;
}

function collectRuntimeConfig(): WebRuntimeConfig {
  const now = Date.now();
  if (runtimeConfigCache && runtimeConfigCache.expiresAt > now) return runtimeConfigCache.value;
  let config: Config;
  try {
    config = resolveRuntimeConfig(process.cwd());
  } catch {
    config = ConfigSchema.parse({});
  }
  const value = sanitizeRuntimeConfig(config);
  runtimeConfigCache = { value, expiresAt: now + CONFIG_CACHE_TTL_MS };
  return value;
}

function collectSkillsCatalog(): Skill[] {
  const now = Date.now();
  if (skillsCatalogCache && skillsCatalogCache.expiresAt > now) return skillsCatalogCache.value;
  let value: Skill[];
  try {
    value = createSkillRegistry().discover(process.cwd());
  } catch {
    value = [];
  }
  skillsCatalogCache = { value, expiresAt: now + CONFIG_CACHE_TTL_MS };
  return value;
}

export function buildMsqWebState(): MsqWebState {
  const repo = resolveRepo();
  const repoLabel = basename(repo.path);
  const runs = collectRuns();
  const gates = collectGates();
  const pendingFeatures = collectPendingFeatures(runs, repo.repoId);
  const runningTasks = collectRunningTasks();
  const timeoutApprovals = collectTimeoutApprovals();
  const featureCatalog = normalizeFeatureCatalog(getFeatureCatalog());
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
    timeoutApprovals,
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
