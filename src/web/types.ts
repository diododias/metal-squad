import type { MsqEvents } from '../core/events/types.js';
import type { SessionStatusSnapshot, ToolCallRecord } from '../core/adapters/types.js';
import type { RunHistoryEntry, RunSummary, RunningTaskSummary, StatsRunRow, TaskRun } from '../db/repo.js';
import type { PendingApproval } from '../ui/hooks/useGates.js';
import type { FeatureCatalogEntry, BacklogSettings } from '../ui/catalog.js';
import type { RunBreakdown } from '../core/stats.js';
import type { ThemeRoleName } from '../ui/theme/types.js';
import type { Config, NotificationChannelConfig } from '../config/index.js';
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
}

export type WebRuntimeConfig = Omit<Config, 'notifications' | 'telegramChatId'> & {
  notifications: {
    channels: WebNotificationChannel[];
    events: Config['notifications']['events'];
  };
};

export interface MsqWebState {
  repoLabel: string;
  runs: RunSummary[];
  gates: PendingApproval[];
  pendingFeatures: FeatureCatalogEntry[];
  runningTasks: RunningTaskSummary[];
  timeoutApprovals: TimeoutApprovalState[];
  featureCatalog: Record<string, FeatureCatalogEntry>;
  backlogSettings: BacklogSettings;
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
  tool?: string;
  model?: string;
  effort?: string;
  maxTokens?: number;
  autoStart?: boolean;
  skills?: string[];
  workflow?: {
    mode?: string;
    stages?: string[];
    syncTasksToBacklog?: boolean;
    approvals?: { channel?: string; autoAdvance?: boolean };
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

export interface FeatureConfigSaveIssue {
  path?: string;
  message: string;
}

export interface FeatureConfigSaveResult {
  type: 'featureConfig:saveResult';
  payload: { featureId: string; ok: boolean; issues?: FeatureConfigSaveIssue[] };
}

export type WebSocketClientMessage =
  | { type: 'auth'; token: string }
  | {
      type: 'action:startFeature';
      featureId: string;
    }
  | { type: 'action:updateFeatureConfig'; featureId: string; patch: FeatureConfigPatch }
  | { type: 'action:updateTaskConfig'; featureId: string; taskId: string; patch: TaskConfigPatch }
  | { type: 'action:pausePipeline'; pipelineId: number }
  | { type: 'action:resumePipeline'; pipelineId: number }
  | { type: 'action:abortPipeline'; pipelineId: number }
  | { type: 'action:requestFeatureAbort'; pipelineId: number; featureId: string }
  | { type: 'action:resolveGate'; gateId: number; decision: 'approved' | 'skipped' | 'retried' }
  | { type: 'action:forceResolveGate'; gateId: number }
  | { type: 'action:resolveStageRequest'; requestId: number; response: string }
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
