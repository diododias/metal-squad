import type { MsqEvents } from '../core/events/types.js';
import type { RunSummary, RunningTaskSummary, StatsRunRow, TaskRun } from '../db/repo.js';
import type { PendingApproval } from '../ui/hooks/useGates.js';
import type { FeatureCatalogEntry, BacklogSettings } from '../ui/catalog.js';
import type { RunBreakdown } from '../core/stats.js';

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
}

export type WebSocketClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'action:startFeature'; featureId: string }
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
  | { type: 'unsubscribe:runDetail'; runId: number };

export type WebSocketServerMessage =
  | { type: 'state:full'; payload: MsqWebState }
  | { type: 'run:detail'; payload: { runId: number; taskRuns: TaskRun[]; breakdown: RunBreakdown | null } }
  | { type: keyof MsqEvents; payload: unknown };

export interface WebServerOptions {
  host?: string;
  port?: number;
  auth?: 'token' | 'none';
  token?: string;
  cwd?: string;
}
