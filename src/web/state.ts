import { basename } from 'node:path';
import {
  listRunsForTui,
  listCompletedFeatureIds,
  openGates,
  listPendingStageRequests,
  listRunningTaskRuns,
  listPendingTimeoutApprovalRequests,
  getProjectStateRevision,
  listProjectStateSummaries,
  listRepositoryStateSummaries,
  listRunsForStats,
  listEpics,
  type EpicRow,
  type GateRow,
  type StageRequestRow,
  type RunSummary,
  type RunningTaskSummary,
  type StatsRunRow,
} from '../db/repo.js';
import { listWorkflowTemplates, listProjectTemplateMappings } from '../db/workflowTemplates.js';
import { resolveRepo } from '../core/repo.js';
import { getFeatureCatalog, getBacklogSettings, getPendingFeatures, type WorkItemCatalogEntry } from '../ui/catalog.js';
import { getRunGroup, sortRunsByGroup } from '../ui/dashboardGroups.js';
import { resolveRuntimeConfig, ConfigSchema, type Config } from '../config/index.js';
import { resolveThemePreference } from '../ui/theme/resolve.js';
import type { ThemeRoleName } from '../ui/theme/types.js';
import { createSkillRegistry } from '../core/skills/registry.js';
import type { Skill } from '../core/skills/types.js';
import { collectEnvironmentInfo } from './environment.js';
import { logCaughtError } from '../core/events/index.js';
import type { MsqWebState, ProjectSummary, RepositorySummary, ThemeSnapshot, TimeoutApprovalState, TokenStats, UiNotification, WebRuntimeConfig, ErrorEntry, WorkflowTemplateMappings, WorkflowTemplateSummary } from './types.js';

const DASHBOARD_PERIODS: { label: string; days: number | null }[] = [
  { label: 'today', days: 1 },
  { label: 'last 7 days', days: 7 },
  { label: 'last 30 days', days: 30 },
  { label: 'all time', days: null },
];

/** Mutable error buffer collected during a single snapshot build. Populated by
 * collector functions and flushed by buildMsqWebState. */
let snapshotErrors: ErrorEntry[] = [];

function pushError(module: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  snapshotErrors.push({
    timestamp: new Date().toISOString(),
    module,
    message,
  });
  logCaughtError(module, error);
}

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
  } catch (error) {
    pushError('web/state.collectGates', error);
    return [];
  }
}

function collectRuns(): RunSummary[] {
  try {
    return sortRunsByGroup(listRunsForTui(2000));
  } catch (error) {
    pushError('web/state.collectRuns', error);
    return [];
  }
}

function collectRunningTasks(): RunningTaskSummary[] {
  try {
    return listRunningTaskRuns(50);
  } catch (error) {
    pushError('web/state.collectRunningTasks', error);
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
  } catch (error) {
    pushError('web/state.collectTimeoutApprovals', error);
    return [];
  }
}

function collectPendingFeatures(runs: RunSummary[], repoId: string): WorkItemCatalogEntry[] {
  try {
    const catalog = getFeatureCatalog();
    const doneFeatureIds = listCompletedFeatureIds(repoId);
    const activeFeatureIds = new Set(
      runs
        .filter((run) => run.status === 'running' || run.status === 'blocked' || run.status === 'done')
        .map((run) => run.featureId),
    );
    return getPendingFeatures(catalog, doneFeatureIds, activeFeatureIds);
  } catch (error) {
    pushError('web/state.collectPendingFeatures', error);
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
  } catch (error) {
    pushError('web/state.collectDashboardRows', error);
    return [];
  }
}

const FALLBACK_ROLE_COLOR = '#e5e7eb';

function normalizeFeatureCatalog(catalog: Record<string, WorkItemCatalogEntry>): Record<string, WorkItemCatalogEntry> {
  return Object.fromEntries(
    Object.entries(catalog).map(([key, feature]) => [
      key,
      { ...feature, persistedId: feature.persistedId ?? feature.id },
    ]),
  );
}

function collectProjectSummaries(): ProjectSummary[] {
  try {
    return listProjectStateSummaries().map((project) => ({
      projectId: project.projectId,
      name: project.name,
      position: project.position,
      description: project.description,
      revision: project.revision,
      counts: {
        epics: project.epicCount,
        workItems: project.workItemCount,
        archived: project.archivedCount,
      },
      activeRuns: project.activeRuns,
      tokens: { status: 'ready', totalTokens: project.totalTokens, error: null },
      archivedAt: project.archivedAt,
    }));
  } catch (error) {
    pushError('web/state.collectProjectSummaries', error);
    return [];
  }
}

/** The state hot path performs no path/Git/tool checks. Those are future lazy,
 * per-repository enrichments and must never turn into N filesystem walks. */
function collectRepositorySummaries(): RepositorySummary[] {
  try {
    return listRepositoryStateSummaries().map((repository) => ({
      repoId: repository.repoId,
      label: basename(repository.path),
      projectId: repository.projectId,
      health: 'unchecked' as const,
      lastCheckedAt: null,
    }));
  } catch (error) {
    pushError('web/state.collectRepositorySummaries', error);
    return [];
  }
}

function collectProjectStateRevision(): number {
  try {
    return getProjectStateRevision();
  } catch (error) {
    pushError('web/state.collectProjectStateRevision', error);
    return 0;
  }
}

function buildThemeSnapshot(): ThemeSnapshot {
  try {
    const resolution = resolveThemePreference(undefined);
    const textColor = resolution.profile.roles.text.color ?? FALLBACK_ROLE_COLOR;
    const roles = Object.fromEntries(
      (Object.entries(resolution.profile.roles) as [ThemeRoleName, { color?: string }][]).map(
        ([role, style]) => [role, style.color ?? textColor],
      ),
    ) as Record<ThemeRoleName, string>;
    return { name: resolution.active, roles };
  } catch (error) {
    pushError('web/state.buildThemeSnapshot', error);
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
function isNotificationChannelConfigured(channel: Config['notifications']['channels'][number]): boolean {
  switch (channel.type) {
    case 'desktop': return true;
    case 'telegram': return channel.chatId.trim().length > 0;
    case 'slack':
    case 'discord': return channel.webhookUrl.trim().length > 0;
    case 'webhook': return channel.url.trim().length > 0;
  }
}

export function sanitizeRuntimeConfig(
  config: Config,
  writability: WebRuntimeConfig['writability'],
): WebRuntimeConfig {
  const { notifications, ...rest } = config;
  return {
    ...rest,
    writability,
    notifications: {
      channels: notifications.channels.map((channel) => ({
        type: channel.type,
        configured: isNotificationChannelConfigured(channel),
      })),
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

// Templates only change through explicit actions, so this cache is invalidated
// on write rather than expiring on a timer.
let workflowTemplatesCache: {
  summaries: WorkflowTemplateSummary[];
  mappings: WorkflowTemplateMappings;
} | null = null;

/** Test hook: drop the runtime-config/skills caches. */
export function resetWebStateCaches(): void {
  invalidateRuntimeConfigCache();
  skillsCatalogCache = null;
  workflowTemplatesCache = null;
}

/** Drop cached templates after a template action so the next state reflects it. */
export function invalidateWorkflowTemplatesCache(): void {
  workflowTemplatesCache = null;
}

function collectWorkflowTemplates(): {
  summaries: WorkflowTemplateSummary[];
  mappings: WorkflowTemplateMappings;
} {
  if (workflowTemplatesCache) return workflowTemplatesCache;
  let value: { summaries: WorkflowTemplateSummary[]; mappings: WorkflowTemplateMappings };
  try {
    const summaries = listWorkflowTemplates({ includeArchived: true }).map((template) => ({
      templateId: template.templateId,
      name: template.name,
      version: template.version,
      revision: template.revision,
      builtin: template.builtin,
      archived: template.archivedAt !== null,
      scopeProjectId: template.scopeProjectId,
      // A count is enough to render a picker; the stage list itself is part of
      // the on-demand definition.
      stageCount: template.definition.workflow.stages.length,
    }));
    const mappings: WorkflowTemplateMappings = {};
    for (const mapping of listProjectTemplateMappings()) {
      const forProject = mappings[mapping.projectId] ?? {};
      forProject[mapping.workItemType] = mapping.templateId;
      mappings[mapping.projectId] = forProject;
    }
    value = { summaries, mappings };
  } catch (error) {
    logCaughtError('web/state.collectWorkflowTemplates', error);
    value = { summaries: [], mappings: {} };
  }
  workflowTemplatesCache = value;
  return value;
}

/** Drop cached config after a settings write so the next state reflects it immediately. */
export function invalidateRuntimeConfigCache(): void {
  runtimeConfigCache = null;
}

function collectRuntimeConfig(writability: WebRuntimeConfig['writability']): WebRuntimeConfig {
  const now = Date.now();
  if (runtimeConfigCache && runtimeConfigCache.expiresAt > now) return runtimeConfigCache.value;
  let config: Config;
  try {
    config = resolveRuntimeConfig(process.cwd());
  } catch (error) {
    pushError('web/state.collectRuntimeConfig', error);
    config = ConfigSchema.parse({});
  }
  const value = sanitizeRuntimeConfig(config, writability);
  runtimeConfigCache = { value, expiresAt: now + CONFIG_CACHE_TTL_MS };
  return value;
}

function collectSkillsCatalog(): Skill[] {
  const now = Date.now();
  if (skillsCatalogCache && skillsCatalogCache.expiresAt > now) return skillsCatalogCache.value;
  let value: Skill[];
  try {
    value = createSkillRegistry().discover(process.cwd());
  } catch (error) {
    pushError('web/state.collectSkillsCatalog', error);
    value = [];
  }
  skillsCatalogCache = { value, expiresAt: now + CONFIG_CACHE_TTL_MS };
  return value;
}

export function buildMsqWebState(): MsqWebState {
  snapshotErrors = [];

  const repo = resolveRepo();
  const repoLabel = basename(repo.path);

  const runs = collectRuns();
  const gates = collectGates();
  const pendingFeatures = collectPendingFeatures(runs, repo.repoId);

  let doneFeatureIds: string[];
  try {
    doneFeatureIds = [...listCompletedFeatureIds(repo.repoId)];
  } catch (error) {
    pushError('web/state.listCompletedFeatureIds', error);
    doneFeatureIds = [];
  }

  const runningTasks = collectRunningTasks();
  const timeoutApprovals = collectTimeoutApprovals();

  let featureCatalog: Record<string, WorkItemCatalogEntry>;
  try {
    featureCatalog = normalizeFeatureCatalog(getFeatureCatalog());
  } catch (error) {
    pushError('web/state.getFeatureCatalog', error);
    featureCatalog = {};
  }

  const backlogSettings = getBacklogSettings();

  const environment = collectEnvironmentInfo();
  const projects = collectProjectSummaries();
  const repositories = collectRepositorySummaries();
  const { summaries: workflowTemplates, mappings: workflowTemplateMappings } = collectWorkflowTemplates();

  let epics: EpicRow[];
  try {
    epics = listEpics();
  } catch (error) {
    pushError('web/state.listEpics', error);
    epics = [];
  }

  const executionRuns = runs.filter((run) => getRunGroup(run.status) === 'execution');
  const doneRuns = runs.filter((run) => run.status === 'done');
  const falhaRunsList = runs.filter((run) => getRunGroup(run.status) === 'canceled');

  const errors = snapshotErrors;
  snapshotErrors = [];

  return {
    revision: collectProjectStateRevision(),
    repoLabel,
    projects,
    repositories,
    epics,
    runs,
    gates,
    pendingFeatures,
    doneFeatureIds,
    runningTasks,
    timeoutApprovals,
    featureCatalog,
    backlogSettings,
    environment,
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
    runtimeConfig: collectRuntimeConfig({
      dbWritable: environment.dbWritable,
      configWritable: environment.configWritable,
    }),
    skillsCatalog: collectSkillsCatalog(),
    workflowTemplates,
    workflowTemplateMappings,
    errors,
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
