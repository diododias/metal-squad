import type { MsqEvents } from '../core/events/types.js';
import type { SessionStatusSnapshot, ToolCallRecord } from '../core/adapters/types.js';
import type { EpicRow, ProjectRepoRow, ProjectRow, RunHistoryEntry, RunSummary, RunningTaskSummary, StatsRunRow, TaskRun, WorkItemRow } from '../db/repo.js';
import type { PendingApproval } from '../ui/hooks/useGates.js';
import type { WorkItemCatalogEntry, BacklogSettings } from '../ui/catalog.js';
import type { RunBreakdown } from '../core/stats.js';
import type { ThemeRoleName } from '../ui/theme/types.js';
import type { AppConfigPatch as ConfigAppConfigPatch, Config, NotificationChannelConfig, NotificationsPatch, ToolRegistryEntry } from '../config/index.js';
import type { Skill } from '../core/skills/types.js';
import type { WorkItemType as MsqWorkItemType } from '../db/workflowTemplates.js';
import type { AllowedLifecycle } from '../core/lifecyclePolicy.js';

export type { AllowedLifecycle } from '../core/lifecyclePolicy.js';

export type { MsqWorkItemType };

/** Client-facing shape of a workflow template: enough to render a picker or
 * badge without shipping the full stage/skill definition. Mirrors the projection
 * in `web/state.collectWorkflowTemplates`; keep in sync. */
export interface WorkflowTemplateSummary {
  templateId: string;
  name: string;
  version: number;
  revision: number;
  builtin: boolean;
  archived: boolean;
  scopeProjectId: string | null;
  stageCount: number;
}

/** Project -> Work Item type -> templateId. Projects without an explicit mapping
 * resolve to the builtin for the type (see `resolveTemplate`); this map is the
 * cache of explicit bindings only, used by the web state to drive the type
 * preview/picker on the client. */
export type WorkflowTemplateMappings = Record<string, Partial<Record<MsqWorkItemType, string>>>;

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
  /**
   * Optional tonal override derived from the originating event. When present,
   * the toast/feed surfaces use this in preference to `type`. Older clients
   * (and the persisted `state:full` snapshot) still derive tone from `type`.
   */
  tone?: 'info' | 'ok' | 'warn' | 'danger';
  /** Optional originating event label (e.g. `run:done`, `gate:created`). */
  event?: string;
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
  updatedAt: string;
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

export interface ErrorEntry {
  timestamp: string;
  module: string;
  message: string;
}

export interface MsqWebState {
  revision: number;
  repoLabel: string;
  projects: ProjectSummary[];
  repositories: RepositorySummary[];
  epics: EpicRow[];
  runs: RunSummary[];
  gates: PendingApproval[];
  pendingFeatures: WorkItemCatalogEntry[];
  doneFeatureIds: string[];
  runningTasks: RunningTaskSummary[];
  timeoutApprovals: TimeoutApprovalState[];
  featureCatalog: Record<string, WorkItemCatalogEntry>;
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
  /** Project Templates page — list of templates available to any project, with
   * the lightweight summary shape (no full definition). The full definition is
   * fetched on demand when the user opens a template. */
  workflowTemplates: WorkflowTemplateSummary[];
  /** Project Templates page — `projectId -> workItemType -> templateId` cache of
   * explicit Project bindings. Projects without a mapping resolve to the
   * builtin for the type (see `resolveTemplate`); this map drives the type
   * preview/picker on the client. */
  workflowTemplateMappings: WorkflowTemplateMappings;
  /** Collector errors since the last snapshot — empty when all collectors succeeded. */
  errors: ErrorEntry[];
  /** Policy-permitted lifecycle actions per entity (PRJ-18), keyed by
   * `${kind}:${id}` (kind = `project` | `epic` | `work_item`). Computed
   * server-side from the single policy engine; the client only enables or
   * disables buttons from these flags and never recomputes the rules.
   * Optional so a snapshot predating PRJ-18 (or one built while the DB was
   * unreadable) simply renders no lifecycle actions instead of throwing. */
  lifecycle?: Record<string, AllowedLifecycle>;
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
  | 'ENTITY_RUNNING'
  | 'ENTITY_HAS_HISTORY'
  | 'ENTITY_IN_USE'
  | 'ANCESTOR_ARCHIVED'
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
  | 'EPIC_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'ENTITY_RUNNING'
  | 'ENTITY_HAS_HISTORY'
  | 'ENTITY_IN_USE'
  | 'ANCESTOR_ARCHIVED'
  | 'EPIC_ACTION_FAILED';

export interface EpicActionError {
  code: EpicActionErrorCode;
  message: string;
}

export type EpicActionResult =
  | { type: 'action:result'; payload: { requestId: string; ok: true; entity: EpicRow } }
  | { type: 'action:result'; payload: { requestId: string; ok: false; error: EpicActionError } };

/** Lifecycle mutation result (PRJ-17). The success payload carries the mutated
 * entity plus its new `revision` for the next optimistic write. The error shape
 * reuses the entity's own action error union so the codes stay consistent. */
export interface LifecycleActionError {
  code: ProjectActionErrorCode | EpicActionErrorCode | WorkItemActionErrorCode;
  message: string;
}

export type LifecycleActionResult =
  | { type: 'action:result'; payload: { requestId: string; ok: true; entity: ProjectRow | EpicRow | WorkItemRow; revision: number } }
  | { type: 'action:result'; payload: { requestId: string; ok: false; error: LifecycleActionError } };


/** One archived entity as listed on `/archived` (PRJ-19). `parentLabel` is the
 * Project name for an Epic row, or the Epic title for a Work Item row — the UI
 * needs it to render breadcrumbs without a second round trip. */
export interface ArchivedEntry {
  kind: 'project' | 'epic' | 'work_item';
  id: string;
  title: string;
  parentLabel: string | null;
  /** Ancestor id backing `parentLabel` — a Project id for an Epic row, an Epic
   * id for a Work Item row. Lets the UI offer a "filter by ancestor" shortcut
   * when `allowed.restore` is false because the ancestor is still archived,
   * without guessing an id from a display label. */
  parentId: string | null;
  repoLabel: string | null;
  workItemType: MsqWorkItemType | null;
  archivedAt: string;
  revision: number;
  allowed: AllowedLifecycle;
}

export interface ArchivedQueryFilters {
  projectId?: string;
  epicId?: string;
  repoId?: string;
  kind?: 'project' | 'epic' | 'work_item';
}

export type ArchivedQueryResult =
  | { type: 'action:archivedResult'; payload: { requestId: string; ok: true; items: ArchivedEntry[]; total: number; limit: number; offset: number } }
  | { type: 'action:archivedResult'; payload: { requestId: string; ok: false; error: { message: string } } };

/** One row in an entity's audit timeline (PRJ-19), the client-facing
 * projection of `AuditEventRow` — `beforeJson`/`afterJson` stay opaque strings
 * the UI may pretty-print but never has to parse into a typed shape. */
export interface AuditTimelineEntry {
  id: number;
  actor: string | null;
  action: string;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: string;
}

export type AuditTrailQueryResult =
  | { type: 'action:auditTrailResult'; payload: { requestId: string; ok: true; entityKind: 'project' | 'epic' | 'work_item'; entityId: string; events: AuditTimelineEntry[] } }
  | { type: 'action:auditTrailResult'; payload: { requestId: string; ok: false; error: { message: string } } };

export type WorkItemActionErrorCode =
  | 'INVALID_PAYLOAD'
  | 'EPIC_NOT_FOUND'
  | 'REPOSITORY_NOT_IN_PROJECT'
  | 'REPOSITORY_UNAVAILABLE'
  | 'DEPENDENCY_NOT_FOUND'
  | 'CROSS_REPOSITORY_DEPENDENCY'
  | 'DEPENDENCY_CYCLE'
  // Surfaced by the type-change action, which shares this error shape.
  | 'WORK_ITEM_NOT_FOUND'
  | 'WORK_ITEM_HAS_HISTORY'
  | 'REVISION_CONFLICT'
  | 'ENTITY_RUNNING'
  | 'ENTITY_HAS_HISTORY'
  | 'ENTITY_IN_USE'
  | 'ANCESTOR_ARCHIVED'
  | 'WORKFLOW_TEMPLATE_NOT_FOUND'
  | 'WORKFLOW_TEMPLATE_INVALID'
  | 'WORK_ITEM_ACTION_FAILED';

export interface WorkItemActionError {
  code: WorkItemActionErrorCode;
  message: string;
}

export type WorkItemActionResult =
  | { type: 'action:result'; payload: { requestId: string; ok: true; workItem: WorkItemRow; revision: number } }
  | { type: 'action:result'; payload: { requestId: string; ok: false; error: WorkItemActionError } };

export interface WorkflowTemplateActionError {
  code: string;
  message: string;
  /** Present only for `WORKFLOW_TEMPLATE_IN_USE`: the type mappings blocking
   * archive, so the UI can offer explicit reassociation instead of a dead end. */
  mappings?: { projectId: string; workItemType: string }[];
}

export type WorkflowTemplateActionResult =
  | { type: 'action:result'; payload: { requestId: string; ok: true; workflowTemplate: WorkflowTemplateSummary; revision: number } }
  | { type: 'action:result'; payload: { requestId: string; ok: true } }
  | { type: 'action:result'; payload: { requestId: string; ok: false; error: WorkflowTemplateActionError } };

/** What a `changeWorkItemType` preview shows before the caller confirms: the
 * template the item would move onto, and the stages it would end up with. */
export interface WorkItemTypeChangePreview {
  workItemId: string;
  fromType: MsqWorkItemType;
  toType: MsqWorkItemType;
  templateId: string;
  templateVersion: number;
  stages: string[];
}

export type WorkItemTypeChangeResult =
  | { type: 'action:result'; payload: { requestId: string; ok: true; preview: WorkItemTypeChangePreview } }
  | { type: 'action:result'; payload: { requestId: string; ok: true; workItem: WorkItemRow; revision: number } }
  | { type: 'action:result'; payload: { requestId: string; ok: false; error: WorkItemActionError } };

/** What the Work Item creation form shows before `action:createWorkItem`: the
 * template a new Work Item of this type/epic/repo would get. Identical shape
 * to the snapshot `action:createWorkItem` will persist (PRJ-24). */
export interface WorkflowTemplatePreview {
  templateId: string;
  templateVersion: number;
  origin: 'project-mapping' | 'builtin';
  stages: string[];
}

export type ResolveWorkflowTemplateResult =
  | { type: 'action:result'; payload: { requestId: string; ok: true; preview: WorkflowTemplatePreview } }
  | { type: 'action:result'; payload: { requestId: string; ok: false; error: WorkItemActionError } };

/** Full definition of a template, fetched on demand (PRJ-26) when the user
 * opens it for editing/duplication — `workflowTemplates` in state only ever
 * carries the lightweight summary. */
export type WorkflowTemplateDefinitionResult =
  | { type: 'action:result'; payload: { requestId: string; ok: true; templateId: string; definition: unknown } }
  | { type: 'action:result'; payload: { requestId: string; ok: false; error: WorkflowTemplateActionError } };

/** Per-repo skill validation matrix for a draft template definition, checked
 * against every active repo of a Project before save/mapping (PRJ-26). */
export interface WorkflowTemplateValidationEntry {
  repoId: string;
  repoLabel: string;
  missing: string[];
}

export type ValidateWorkflowTemplateResult =
  | { type: 'action:result'; payload: { requestId: string; ok: true; valid: boolean; matrix: WorkflowTemplateValidationEntry[] } }
  | { type: 'action:result'; payload: { requestId: string; ok: false; error: WorkflowTemplateActionError } };

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
  | { type: 'action:archiveProject'; requestId: string; projectId: string; expectedRevision: number }
  | { type: 'action:deleteProject'; requestId: string; projectId: string; expectedRevision: number }
  | { type: 'action:restoreArchivedProject'; requestId: string; projectId: string; expectedRevision: number }
  | { type: 'action:archiveEpic'; requestId: string; epicId: string; expectedRevision: number }
  | { type: 'action:deleteEpic'; requestId: string; epicId: string; expectedRevision: number }
  | { type: 'action:restoreArchivedEpic'; requestId: string; epicId: string; expectedRevision: number }
  | { type: 'action:archiveWorkItem'; requestId: string; workItemId: string; expectedRevision: number }
  | { type: 'action:deleteWorkItem'; requestId: string; workItemId: string; expectedRevision: number }
  | { type: 'action:restoreArchivedWorkItem'; requestId: string; workItemId: string; expectedRevision: number }
  | { type: 'action:queryArchived'; requestId: string; filters: ArchivedQueryFilters; limit: number; offset: number }
  | { type: 'action:queryAuditTrail'; requestId: string; entityKind: 'project' | 'epic' | 'work_item'; entityId: string }
  | { type: 'action:createEpic'; requestId: string; projectId: string; title: string; description?: string | null }
  | { type: 'action:createWorkItem'; requestId: string; epicId: string; repoId: string; workItemType?: MsqWorkItemType; title: string; description?: string | null; dependsOn?: string[] }
  | { type: 'action:resolveWorkflowTemplate'; requestId: string; epicId: string; repoId: string; workItemType: MsqWorkItemType }
  | { type: 'action:createWorkflowTemplate'; requestId: string; projectId: string; name: string; definition: unknown }
  | { type: 'action:updateWorkflowTemplate'; requestId: string; templateId: string; expectedRevision: number; patch: { name?: string; definition?: unknown } }
  | { type: 'action:duplicateWorkflowTemplate'; requestId: string; templateId: string; projectId: string; name?: string }
  | { type: 'action:archiveWorkflowTemplate'; requestId: string; templateId: string }
  | { type: 'action:setTypeTemplate'; requestId: string; projectId: string; workItemType: MsqWorkItemType; templateId: string }
  | { type: 'action:getWorkflowTemplateDefinition'; requestId: string; templateId: string }
  | { type: 'action:validateWorkflowTemplate'; requestId: string; projectId: string; definition: unknown }
  | { type: 'action:changeWorkItemType'; requestId: string; workItemId: string; workItemType: MsqWorkItemType; expectedRevision: number; preview?: boolean }
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
  | WorkflowTemplateActionResult
  | WorkItemTypeChangeResult
  | ResolveWorkflowTemplateResult
  | WorkflowTemplateDefinitionResult
  | ValidateWorkflowTemplateResult
  | ArchivedQueryResult
  | AuditTrailQueryResult
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
