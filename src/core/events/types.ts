import type { Tool } from '../backlog/schema.js';
import type { RunBlockedCode, RunResult, SessionStatusSnapshot, ToolCallRecord } from '../adapters/types.js';
import type { StageTransitionDecision } from '../workflow/sessionPolicy.js';

export type GateDecision = 'approved' | 'skipped' | 'retried';
export type OutputStream = 'stdout' | 'stderr';
export type OutputSource = 'stdout' | 'stderr' | 'agent' | 'tool' | 'heartbeat';
export type OutputLevel = 'error' | 'warn';
export type StageRequestKind = 'approval' | 'input';
export type ContextQueryTool = 'dora' | 'serena' | 'shell';
export type ContextQueryKind = 'structured' | 'shell_read';

export interface RunStartEvent {
  runId: number;
  featureId: string;
  tool: Tool;
  stage?: string;
  featureName?: string;
}

export type RunStatusEvent = SessionStatusSnapshot;
export type ToolCallEvent = ToolCallRecord;

export interface RunOutputEvent {
  runId: number;
  line: string;
  stream: OutputStream;
  featureId?: string;
  tool?: Tool;
  source?: OutputSource;
  createdAt?: string;
  toolName?: string;
  level?: OutputLevel;
}

export interface RunDoneEvent {
  runId: number;
  featureId: string;
  tool: Tool;
  result: RunResult;
  featureName?: string;
}

export type RunFailedKind = 'execution' | 'aborted';

export interface RunFailedEvent {
  runId: number;
  featureId: string;
  tool: Tool;
  error: string;
  kind: RunFailedKind;
  featureName?: string;
  pipelineId?: number | null;
  blocked?: boolean;
}

export type RunBlockedReason = 'needs_input' | 'gate' | 'budget' | 'token' | 'precondition_failed';

export interface RunBlockedEvent {
  runId: number;
  featureId: string;
  tool: Tool;
  /** `reason` routes recovery; `code` explains the specific blocking cause. */
  reason: RunBlockedReason;
  code?: RunBlockedCode;
  summary: string;
}

export interface GateCreatedEvent {
  gateId: number;
  featureId: string;
  runId?: number;
  repoId?: string;
  featureName?: string;
}

export interface GateResolvedEvent {
  gateId: number;
  decision: GateDecision;
}

export interface StageRequestCreatedEvent {
  requestId: number;
  pipelineId: number;
  featureId: string;
  stage: string;
  kind: StageRequestKind;
  prompt: string;
  source?: 'manual' | 'auto';
  approvalChannel?: string;
  options?: string[];
  featureName?: string;
}

export interface StageRequestResolvedEvent {
  requestId: number;
  kind: StageRequestKind;
  response: string;
}

export interface TimeoutApprovalCreatedEvent {
  requestId: number;
  occurrenceId: number;
  runId: number;
  pipelineId?: number;
  featureId: string;
  stage?: string;
  timeoutMs: number;
  runtimeMs: number;
  lastProgress?: string;
}

export interface TimeoutApprovalResolvedEvent {
  requestId: number;
  occurrenceId: number;
  runId: number;
  featureId: string;
  stage?: string;
  decision: 'retry' | 'keep_blocked';
  source: 'telegram';
}

export type StageTransitionDecidedEvent = StageTransitionDecision;

export interface BudgetAlertEvent {
  percent: number;
  spent: number;
  limit: number;
}

export interface TokensUpdateEvent {
  runId: number;
  input: number;
  cachedInput?: number;
  output: number;
  total: number;
  featureId?: string;
  tool?: Tool;
}

export interface ContextQueryEvent {
  runId: number;
  featureId?: string;
  tool?: Tool;
  queryTool: ContextQueryTool;
  kind: ContextQueryKind;
  target?: string | null;
  observedBytes: number;
  latencyMs?: number | null;
  cacheHit?: boolean | null;
  rawLine: string;
}

export interface TaskStartedEvent {
  runId: number;
  featureId: string;
  taskId: string;
  title: string;
  stage?: string;
}

export interface TaskUpdatedEvent {
  runId: number;
  featureId: string;
  taskId: string;
  status: 'running' | 'done' | 'failed' | 'skipped' | 'blocked';
  stage?: string;
  endedAt?: string;
}

export interface UiNoticeEvent {
  message: string;
}

export interface UiInfoEvent {
  message: string;
}

export type AutoPilotOutcomeKind =
  | 'success'
  | 'blocked-human'
  | 'failed-execution'
  | 'blocked-protective'
  | 'aborted-manual';

export type AutoPilotAction = 'start' | 'idle' | 'stop';

export interface AutoPilotDecisionEvent {
  triggerFeatureId: string;
  triggerRunId: number;
  triggerKind: AutoPilotOutcomeKind;
  action: AutoPilotAction;
  selectedFeatureId?: string;
  reason: string;
}

export interface MsqEvents {
  'run:start': RunStartEvent;
  'run:status': RunStatusEvent;
  'tool:call': ToolCallEvent;
  'run:output': RunOutputEvent;
  'run:done': RunDoneEvent;
  'run:failed': RunFailedEvent;
  'run:blocked': RunBlockedEvent;
  'gate:created': GateCreatedEvent;
  'gate:resolved': GateResolvedEvent;
  'stage:request-created': StageRequestCreatedEvent;
  'stage:request-resolved': StageRequestResolvedEvent;
  'timeout:approval-created': TimeoutApprovalCreatedEvent;
  'timeout:approval-resolved': TimeoutApprovalResolvedEvent;
  'stage:transition-decided': StageTransitionDecidedEvent;
  'scheduler:paused': Record<string, never>;
  'scheduler:resumed': Record<string, never>;
  'budget:alert': BudgetAlertEvent;
  'tokens:update': TokensUpdateEvent;
  'context:query': ContextQueryEvent;
  'task:started': TaskStartedEvent;
  'task:updated': TaskUpdatedEvent;
  'ui:info': UiInfoEvent;
  'ui:notice': UiNoticeEvent;
  'autopilot:decision': AutoPilotDecisionEvent;
}
