import type { Effort, Feature, Tool } from '../backlog/schema.js';

const SESSION_LIMIT_PATTERNS: RegExp[] = [
  /session limit/i,
  /rate limit/i,
  /insufficient balance/i,
  /insuficiente/i,
  /quota exceeded/i,
];

// A real limit/quota error is always the last thing the CLI prints before
// exiting. Scanning the whole transcript false-positives on incidental
// mentions buried in earlier tool output (e.g. a `git log` result quoting a
// commit message that happens to contain "session limit" — see H33). Only
// the tail of the closing output can plausibly be a genuine error.
const SESSION_LIMIT_TAIL_CHARS = 50;

export function detectSessionLimit(stdout: string, stderr: string): string | null {
  const combined = `${stdout}\n${stderr}`.trimEnd();
  const tail = combined.slice(-SESSION_LIMIT_TAIL_CHARS);
  for (const pattern of SESSION_LIMIT_PATTERNS) {
    const match = pattern.exec(tail);
    if (match) return match[0];
  }
  return null;
}

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

export function sanitizeToolCallValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((entry) => sanitizeToolCallValue(entry, seen));
  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeToolCallValue(entry, seen),
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
    output: record.output ?? null,
    step: record.step?.slice(0, 200) ?? null,
    error: record.error ?? null,
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

export const RUN_BLOCKED_CODES = [
  'dependency_unavailable',
  'precondition_failed',
  'environment_error',
  'spec_ambiguous',
  'validation_failed',
] as const;

export type RunBlockedCode = (typeof RUN_BLOCKED_CODES)[number];

export interface DeclaredPublication {
  prUrl: string;
  prNumber: number | null;
  base: string;
  head: string;
}

export interface RunControlDone {
  type: 'done';
  summary: string;
  publication?: DeclaredPublication;
}

export interface RunControlBlocked {
  type: 'blocked';
  code: RunBlockedCode;
  reason: string;
}

export interface TimeoutResult {
  timeoutMs: number;
  runtimeMs: number;
  lastProgress?: string;
}

export type RunControl = RunControlNeedsInput | RunControlDone | RunControlBlocked;

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
  /** A pre-run condition failed and needs an operator action before retrying. */
  blocked?: boolean;
  usage?: TokenUsage;
  control?: RunControl;
  aborted?: boolean;
  session?: SessionHandle | null;
  publishEvidence?: PublishEvidence;
  publishVerified?: boolean;
  publishVerificationStatus?: 'blocked' | 'failed';
  /** True when the agent-declared PR and the independently observed PR disagree. */
  publishValidationFailed?: boolean;
  /** Non-blocking caveat about an already-verified publication (e.g. local base-ancestry check was inconclusive). */
  publishNote?: string;
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
