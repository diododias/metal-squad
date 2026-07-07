import type { Tool } from '../backlog/schema.js';
import type { RunResult } from '../adapters/types.js';

export type GateDecision = 'approved' | 'skipped' | 'retried';
export type OutputStream = 'stdout' | 'stderr';
export type OutputSource = 'stdout' | 'stderr' | 'agent' | 'tool' | 'heartbeat';
export type StageRequestKind = 'approval' | 'input';

export interface RunStartEvent {
  runId: number;
  featureId: string;
  tool: Tool;
}

export interface RunOutputEvent {
  runId: number;
  line: string;
  stream: OutputStream;
  featureId?: string;
  tool?: Tool;
  source?: OutputSource;
}

export interface RunDoneEvent {
  runId: number;
  featureId: string;
  tool: Tool;
  result: RunResult;
}

export interface RunFailedEvent {
  runId: number;
  featureId: string;
  tool: Tool;
  error: string;
}

export interface GateCreatedEvent {
  gateId: number;
  featureId: string;
  runId?: number;
  repoId?: string;
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
}

export interface StageRequestResolvedEvent {
  requestId: number;
  kind: StageRequestKind;
  response: string;
}

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

export interface MsqEvents {
  'run:start': RunStartEvent;
  'run:output': RunOutputEvent;
  'run:done': RunDoneEvent;
  'run:failed': RunFailedEvent;
  'gate:created': GateCreatedEvent;
  'gate:resolved': GateResolvedEvent;
  'stage:request-created': StageRequestCreatedEvent;
  'stage:request-resolved': StageRequestResolvedEvent;
  'scheduler:paused': Record<string, never>;
  'scheduler:resumed': Record<string, never>;
  'budget:alert': BudgetAlertEvent;
  'tokens:update': TokensUpdateEvent;
  'task:started': TaskStartedEvent;
  'task:updated': TaskUpdatedEvent;
}
