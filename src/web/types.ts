import type { MsqEvents } from '../core/events/types.js';
import type { RunHistoryEntry, RunSummary, RunningTaskSummary, StatsRunRow, TaskRun } from '../db/repo.js';
import type { PendingApproval } from '../ui/hooks/useGates.js';
import type { FeatureCatalogEntry, BacklogSettings } from '../ui/catalog.js';
import type { RunBreakdown } from '../core/stats.js';
import type { ThemeRoleName } from '../ui/theme/types.js';

export interface TokenStats {
  status: 'loading' | 'ready' | 'error';
  totalTokens: number | null;
  error: string | null;
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

export interface TokenEstimate {
  sampleSize: number;
  avgTotalTokens: number | null;
  medianTotalTokens: number | null;
}

export interface MsqWebState {
  repoLabel: string;
  runs: RunSummary[];
  gates: PendingApproval[];
  pendingFeatures: FeatureCatalogEntry[];
  runningTasks: RunningTaskSummary[];
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
  tokenEstimatesByTool: Record<'claude' | 'codex' | 'opencode', TokenEstimate>;
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
  skills?: string[];
  workflow?: {
    mode?: string;
    stages?: string[];
    syncTasksToBacklog?: boolean;
    approvals?: { autoAdvance?: boolean };
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

export type WebSocketClientMessage =
  | { type: 'auth'; token: string }
  | {
      type: 'action:startFeature';
      featureId: string;
      overrides?: { tool?: string; model?: string; effort?: string };
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
  | { type: 'run:detail'; payload: { runId: number; taskRuns: TaskRun[]; breakdown: RunBreakdown | null } }
  | { type: 'run:history'; payload: { featureId: string; runs: RunHistoryEntry[] } }
  | { type: 'run:changes'; payload: RunChangesPayload }
  | { type: 'error'; payload: { message: string } }
  | { type: keyof MsqEvents; payload: unknown };

export interface WebServerOptions {
  host?: string;
  port?: number;
  auth?: 'token' | 'none';
  token?: string;
  cwd?: string;
}
