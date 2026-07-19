import type { MsqEvents } from '../core/events/types.js';
import type { SessionStatusSnapshot, ToolCallRecord } from '../core/adapters/types.js';
import type { EpicRow, ProjectRepoRow, ProjectRow, RunHistoryEntry, RunSummary, RunningTaskSummary, StatsRunRow, TaskRun, WorkItemRow } from '../db/repo.js';
import type { PendingApproval } from '../ui/hooks/useGates.js';
import type { FeatureCatalogEntry, BacklogSettings } from '../ui/catalog.js';
import type { RunBreakdown } from '../core/stats.js';
import type { ThemeRoleName } from '../ui/theme/types.js';
import type { AppConfigPatch as ConfigAppConfigPatch, Config, NotificationChannelConfig, NotificationsPatch, ToolRegistryEntry } from '../config/index.js';
import type { Skill } from '../core/skills/types.js';

export interface TokenStats {
  status: 'loading' | 'ready' | 'error';
  totalTokens: number | null;
  error: string | null;
}

export interface TimeoutApprovalState {
  requestId: number;
  occurrenceId: number;
  runId: number;
  pipelineId: number | null;
  featureId: string;
  stage: string | null;
  status: 'pending' | 'approved' | 'blocked' | 'cancelled' | 'superseded';
  notificationStatus: 'pending' | 'sent' | 'failed';
  notificationAttempts: number;
  createdAt: string;
}

export interface UiNotification {
  id: string;
  type: 'info' | 'notice';
  message: string;
  createdAt: string;
}

// F34 item 6: web reads the same theme config field the TUI uses (F10) and
// exposes the resolved semantic roles so styles.css can derive its custom
// properties instead of hardcoding a single dark palette.
export interface ThemeSnapshot {
  name: 'default' | 'dark' | 'light' | 'minimal';
  roles: Record<ThemeRoleName, string>;
}

export interface WebNotificationChannel {
  type: NotificationChannelConfig['type'];
  /** Whether the channel has the credential material it needs, never the material itself. */
  configured: boolean;
}

export interface RuntimeConfigWritability {
  dbWritable: boolean;
  configWritable: boolean;
}

export type WebRuntimeConfig = Omit<Config, 'notifications'> & {
  writability: RuntimeConfigWritability;
  notifications: {
    channels: WebNotificationChannel[];
    events: Config['notifications']['events'];
  };
};

export interface ProjectSummary {
  projectId: string;
  name: string;
  /** Stable ordering for client-only active-project fallback. */
  position: number;
  description: string | null;
  revision: number;
  counts: { epics: number; workItems: number; archived: number };
  activeRuns: number;
  tokens: TokenStats;
  archivedAt: string | null;
}

export interface RepositorySummary {
  repoId: string;
  label: string;
  projectId: string | null;
  health: 'ok' | 'unavailable' | 'unchecked';
  lastCheckedAt: string | null;
  /** Omitted from the default broadcast; a future authenticated,
   * route-specific response may expose it. */
  path?: string;
}

/** Read-only diagnostics collected by the backend for the Settings page. */
export interface EnvironmentInfo {
  databasePath: string;
  databaseSource: 'default' | 'override';
  dbWritable: boolean;
  dataDir: string;
  configDir: string;
  configWritable: boolean;
  repoPath?: string;
  repoId?: string;
  version?: string;
}

export interface MsqWebState {
  revision: number;
  repoLabel: string;
  projects: ProjectSummary[];
  repositories: RepositorySummary[];
  runs: RunSummary[];
  gates: PendingApproval[];
  pendingFeatures: FeatureCatalogEntry[];
  runningTasks: RunningTaskSummary[];
  timeoutApprovals: TimeoutApprovalState[];
  featureCatalog: Record<string, FeatureCatalogEntry>;
  backlogSettings: BacklogSettings;
  environment: EnvironmentInfo;
  stats: {
    totalRuns: number;
    doneRuns: number;
    executionCount: number;
    falhaCount: number;
    tokenStats: TokenStats;
  };
  dashboard: {
    periods: { label: string; days: number | null }[];
    rows: StatsRunRow[];
  };
  notifications: UiNotification[];
  theme: ThemeSnapshot;
  /** Config page (Runtime/Notifications/Budget sub-tabs) — read-only
   * resolved runtime config. Notification channels are reduced to their type:
   * Slack/Discord/webhook URLs and the Telegram chat id are bearer-style
   * credentials and must not reach WebSocket clients (with auth 'none' any
   * local process could read them). */
  runtimeConfig: WebRuntimeConfig;
  /** Config page (Skills sub-tab) — discovered skills with precedence
   * already applied (repo > global > external > builtin), read-only. */
  skillsCatalog: Skill[];
}

export interface RunChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
}

export interface RunChangesPayload {
  runId: number;
  branch: string | null;
  remoteUrl: string | null;
  files: RunChangedFile[];
  notApplicableReason: string | null;
}

/** Explicit narrow patch shape for `action:updateFeatureConfig` — not
 * `Partial<Feature>`, so the wire contract can't smuggle in `id`/`tasks`
 * reshaping from an untrusted client. */
export interface FeatureConfigPatch {
  spec?: string;
  tool?: string;
  model?: string;
  effort?: string;
  thinking?: string;
  maxTokens?: number;
  autoStart?: boolean;
  skills?: string[];
  workflow?: {
    mode?: string;
    stages?: string[];
    autoAdvance?: boolean;
    syncTasksToBacklog?: boolean;
    approvals?: { channel?: string };
    stepGuidance?: Record<string, { skills?: string[]; prompt?: string }>;
    sessionPolicy?: { alwaysIsolatedStages?: string[] };
  };
  retry?: { maxAttempts?: number; backoffMs?: number; onFail?: string };
}

/** Explicit narrow patch shape for `action:updateTaskConfig`. */
export interface TaskConfigPatch {
  title?: string;
  status?: string;
  skills?: string[];
  dependsOn?: string[];
}

/** Explicit narrow patch shape for `action:updateProjectDefaults` — mirrors
 * `CatalogDefaultsPatch` on the wire so the client can't smuggle in fields
 * outside the project defaults/budget contract. */
export interface ProjectDefaultsPatch {
  tool?: string;
  model?: string;
  effort?: string;
  thinking?: string;
  skills?: string[];
  stageSkills?: Record<string, string[]>;
  workflow?: {
    mode?: string;
    stages?: string[];
    autoAdvance?: boolean;
    syncTasksToBacklog?: boolean;
    approvals?: { channel?: string };
  };
  maxTokens?: number;
  budget?: { maxTokens?: number; perFeatureMaxTokens?: number };
}

/** Narrow global config patch for the App Budget settings. */
export interface BudgetConfigPatch {
  alertAtPercent: number;
}

/** App-owned runtime config patch accepted by the Settings WebSocket API. */
export type AppConfigPatch = ConfigAppConfigPatch;

/** Write-only secret input. It is accepted by the WebSocket action but is never
 * included in state or any server message. */
export interface SecretPatch {
  account: string;
  value: string;
}

/** Complete App-level tool registry replacement. The server validates this
 * against ConfigSchema before it is persisted to config.json. */
export interface ToolsRegistryPatch {
  tools: ToolRegistryEntry[];
}

export interface FeatureConfigSaveIssue {
  path?: string;
  message: string;
}

export interface FeatureConfigSaveResult {
  type: 'featureConfig:saveResult';
  payload: { featureId: string; ok: boolean; issues?: FeatureConfigSaveIssue[] };
}

export type ProjectActionErrorCode =
  | 'INVALID_PAYLOAD'
  | 'PROJECT_NOT_FOUND'
  | 'REPO_NOT_FOUND'
  | 'REPO_NOT_LINKED_TO_PROJECT'
  | 'REPO_ALREADY_LINKED'
  | 'REPO_IN_USE'
  | 'REPO_PATH_CONFIRMATION_REQUIRED'
  | 'REPO_PATH_NOT_FOUND'
  | 'REPO_PATH_NOT_DIRECTORY'
  | 'REPO_PATH_NOT_ALLOWED'
  | 'REVISION_CONFLICT'
  | 'PROJECT_ACTION_FAILED';

export interface ProjectActionError {
  code: ProjectActionErrorCode;
  message: string;
}

export type ProjectActionResult =
  | {
      type: 'action:result';
      payload: { requestId: string; ok: true; entity: ProjectRow };
    }
  | {
      type: 'action:result';
      payload: {
        requestId: string;
        ok: false;
        error: ProjectActionError;
      };
    };

export type RepositoryActionResult =
  | {
      type: 'action:result';
      payload: { requestId: string; ok: true; entity: ProjectRepoRow | { repoId: string; unlinked: boolean } | null };
    }
  | {
      type: 'action:result';
      payload: { requestId: string; ok: false; error: ProjectActionError };
    };

export type EpicActionErrorCode =
  | 'INVALID_PAYLOAD'
  | 'PROJECT_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'EPIC_ACTION_FAILED';

export interface EpicActionError {
  code: EpicActionErrorCode;
  message: string;
}

export type EpicActionResult =
  | { type: 'action:result'; payload: { requestId: string; ok: true; entity: EpicRow } }
  | { type: 'action:result'; payload: { requestId: string; ok: false; error: EpicActionError } };

export type WorkItemActionErrorCode =
  | 'INVALID_PAYLOAD'
  | 'EPIC_NOT_FOUND'
  | 'REPOSITORY_NOT_IN_PROJECT'
  | 'REPOSITORY_UNAVAILABLE'
  | 'DEPENDENCY_NOT_FOUND'
  | 'CROSS_REPOSITORY_DEPENDENCY'
  | 'DEPENDENCY_CYCLE'
  | 'WORK_ITEM_ACTION_FAILED';

export interface WorkItemActionError {
  code: WorkItemActionErrorCode;
  message: string;
}

export type WorkItemActionResult =
  | { type: 'action:result'; payload: { requestId: string; ok: true; workItem: WorkItemRow; revision: number } }
  | { type: 'action:result'; payload: { requestId: string; ok: false; error: WorkItemActionError } };

export type WebSocketClientMessage =
  | { type: 'auth'; token: string }
  | {
      type: 'action:startFeature';
      featureId: string;
    }
  | { type: 'action:updateFeatureConfig'; featureId: string; patch: FeatureConfigPatch }
  | { type: 'action:updateTaskConfig'; featureId: string; taskId: string; patch: TaskConfigPatch }
  | { type: 'action:updateProjectDefaults'; patch: ProjectDefaultsPatch }
  | { type: 'action:createProject'; requestId: string; name: string; description?: string | null }
  | {
      type: 'action:updateProject';
      requestId: string;
      projectId: string;
      expectedRevision: number;
      patch: { name?: string; description?: string | null; position?: number };
    }
  | { type: 'action:linkRepo'; requestId: string; projectId: string; repoId?: string; path?: string; confirm?: boolean }
  | { type: 'action:moveRepo'; requestId: string; repoId: string; toProjectId: string; expectedRevision?: number }
  | { type: 'action:unlinkRepo'; requestId: string; projectId: string; repoId: string }
  | { type: 'action:createEpic'; requestId: string; projectId: string; title: string; description?: string | null }
  | { type: 'action:createWorkItem'; requestId: string; epicId: string; repoId: string; title: string; description?: string | null; dependsOn?: string[] }
  | {
      type: 'action:updateEpic';
      requestId: string;
      epicId: string;
      expectedRevision: number;
      patch: { title?: string; description?: string | null; status?: 'todo' | 'in_progress' | 'done'; position?: number };
    }
  | { type: 'action:updateBudgetConfig'; patch: BudgetConfigPatch }
  | { type: 'action:updateNotifications'; patch: NotificationsPatch }
  | { type: 'action:updateAppConfig'; patch: AppConfigPatch }
  | { type: 'action:setSecret'; patch: SecretPatch }
  | { type: 'action:clearSecret'; account: string }
  | { type: 'action:updateToolsRegistry'; tools: ToolRegistryEntry[] }
  | { type: 'action:pausePipeline'; pipelineId: number }
  | { type: 'action:resumePipeline'; pipelineId: number }
  | { type: 'action:abortPipeline'; pipelineId: number }
  | { type: 'action:requestFeatureAbort'; pipelineId: number; featureId: string }
  | { type: 'action:resolveGate'; gateId: number; decision: 'approved' | 'skipped' | 'retried' }
  | { type: 'action:forceResolveGate'; gateId: number }
  | { type: 'action:resolveStageRequest'; requestId: number; response: string }
  | {
      type: 'action:resumeWithOverride';
      pipelineId: number;
      featureId: string;
      tool?: string;
      model?: string;
      effort?: string;
    }
  | { type: 'subscribe:output'; runId: number }
  | { type: 'unsubscribe:output'; runId: number }
  | { type: 'subscribe:runDetail'; runId: number }
  | { type: 'unsubscribe:runDetail'; runId: number }
  | { type: 'subscribe:runHistory'; featureId: string }
  | { type: 'unsubscribe:runHistory'; featureId: string }
  | { type: 'subscribe:runChanges'; runId: number }
  | { type: 'unsubscribe:runChanges'; runId: number };

export type WebSocketServerMessage =
  | { type: 'state:full'; payload: MsqWebState }
  | FeatureConfigSaveResult
  | ProjectActionResult
  | RepositoryActionResult
  | EpicActionResult
  | WorkItemActionResult
  | { type: 'run:detail'; payload: { runId: number; taskRuns: TaskRun[]; breakdown: RunBreakdown | null; sessionStatus: SessionStatusSnapshot | null; statusHistory: SessionStatusSnapshot[]; toolCalls: ToolCallRecord[] } }
  | { type: 'run:history'; payload: { featureId: string; runs: RunHistoryEntry[] } }
  | { type: 'run:changes'; payload: RunChangesPayload }
  | { type: 'run:status'; payload: SessionStatusSnapshot }
  | { type: 'tool:call'; payload: ToolCallRecord }
  | { type: 'error'; payload: { message: string } }
  | { type: Exclude<keyof MsqEvents, 'run:status' | 'tool:call'>; payload: unknown };

export interface WebServerOptions {
  host?: string;
  port?: number;
  auth?: 'token' | 'none';
  token?: string;
  cwd?: string;
}
