import type { Effort, Feature, Tool } from '../backlog/schema.js';

export type SessionStatus = 'running' | 'idle' | 'interrupted' | 'failed' | 'timed_out' | 'completed';

export interface SessionStatusSnapshot {
  runId: number;
  featureId: string;
  tool: Tool;
  status: SessionStatus;
  startedAt: string;
  updatedAt: string;
  elapsedMs: number;
  lastOutputAt: string | null;
  idleMs: number | null;
  reason: string | null;
  terminal: boolean;
}

export type ToolCallPhase = 'started' | 'completed' | 'failed';

export interface ToolCallRecord {
  id: string;
  runId: number;
  featureId: string;
  tool: Tool;
  sequence: number;
  phase: ToolCallPhase;
  name: string;
  arguments: unknown;
  output: string | null;
  step: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export type SessionStatusCallback = (snapshot: SessionStatusSnapshot) => void;
export type ToolCallCallback = (record: ToolCallRecord) => void;

const SENSITIVE_KEY = /(token|secret|password|authorization|api[_-]?key|cookie)/i;

const STDERR_LOG_LEVEL = /^\S+\s+(ERROR|WARN)\s/;

export function detectStderrLevel(line: string): 'error' | 'warn' | undefined {
  const match = STDERR_LOG_LEVEL.exec(line);
  if (!match) return undefined;
  return match[1] === 'ERROR' ? 'error' : 'warn';
}

export function sanitizeToolCallValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, 2_000);
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => sanitizeToolCallValue(entry, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).slice(0, 50).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeToolCallValue(entry, depth + 1),
      ]),
    );
  }
  return '[unsupported]';
}

export function sanitizeToolCallRecord(record: ToolCallRecord): ToolCallRecord {
  return {
    ...record,
    id: record.id.slice(0, 200),
    name: record.name.slice(0, 200),
    arguments: sanitizeToolCallValue(record.arguments),
    output: record.output?.slice(0, 20_000) ?? null,
    step: record.step?.slice(0, 200) ?? null,
    error: record.error?.slice(0, 500) ?? null,
  };
}

export interface TokenUsage {
  input: number;
  cachedInput?: number;
  output: number;
  total: number;
}

export interface RunControlNeedsInput {
  type: 'needs_input';
  prompt: string;
  options?: string[];
}

export interface TimeoutResult {
  timeoutMs: number;
  runtimeMs: number;
  lastProgress?: string;
}

export type RunControl = RunControlNeedsInput;

export interface SessionHandle {
  tool: Tool;
  sessionId: string;
  capturedFromRunId: number;
  capturedAt: string;
}

export interface PublishEvidence {
  branch: string | null;
  baseBranch: string;
  commitSha: string | null;
  remoteBranch: string | null;
  prNumber: number | null;
  prUrl: string | null;
}

export type SessionReuseMode = 'new' | 'resume';

export interface RunFeatureOptions {
  cwd: string;
  runId: number;
  signal?: AbortSignal;
  session?: {
    mode: SessionReuseMode;
    handle?: SessionHandle;
  };
  onStatus?: SessionStatusCallback;
  onToolCall?: ToolCallCallback;
  stageSkills?: Record<string, string[]>;
}

export interface RunResult {
  ok: boolean;
  summary: string;
  usage?: TokenUsage;
  control?: RunControl;
  aborted?: boolean;
  session?: SessionHandle | null;
  publishEvidence?: PublishEvidence;
  publishVerified?: boolean;
  publishVerificationStatus?: 'blocked' | 'failed';
  timeout?: TimeoutResult;
}

export interface ToolCapabilities {
  model: boolean;
  effort: boolean;
  thinking: boolean;
}

export interface ToolAdapter {
  readonly tool: Tool;
  /** Mapeia effort normalizado para a flag nativa da ferramenta. */
  effortFlag(effort: Effort): string[];
  /** Executa uma fase spec-kit para a feature com o prompt já construído. */
  runFeature(feature: Feature, prompt: string, opts: RunFeatureOptions): Promise<RunResult>;
  /** Extrai uso de tokens do transcript, se disponível. */
  parseUsage?(transcript: string): TokenUsage | null;
  /** Verifica de forma rápida e síncrona se o binário desta ferramenta está disponível no ambiente atual. */
  isAvailable?(): boolean;
}
