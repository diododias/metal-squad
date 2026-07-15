import { sanitizeToolCallRecord, type SessionHandle, type ToolAdapter, type RunResult, type RunFeatureOptions, type TokenUsage, type ToolCallRecord } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveRuntimeConfig } from '../../config/index.js';
import { CliAbortError, CliTimeoutError, runCli } from './spawn.js';
import { msqEventBus } from '../events/index.js';
import { parseControlSignal } from './control.js';

interface CodexEvent {
  type?: string;
  message?: string;
  thread_id?: string;
  error?: {
    message?: string;
  };
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
    reasoning_output_tokens?: number;
  };
  item?: {
    type?: string;
    text?: string;
    message?: string;
    name?: string;
    tool_name?: string;
    arguments?: unknown;
    input?: unknown;
    output?: unknown;
    result?: unknown;
    command?: string;
    aggregated_output?: string;
    exit_code?: number;
  };
}

const EFFORT: Record<Effort, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
};

export const codexAdapter: ToolAdapter = {
  tool: 'codex',

  effortFlag(effort: Effort): string[] {
    return ['-c', `model_reasoning_effort="${EFFORT[effort]}"`];
  },

  isAvailable(): boolean {
    try {
      execFileSync('codex', ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },

  async runFeature(feature: Feature, prompt: string, opts: RunFeatureOptions): Promise<RunResult> {
    const args = opts.session?.mode === 'resume' && opts.session.handle
      ? [
          'exec',
          'resume',
          '--json',
          '--skip-git-repo-check',
          ...(feature.model ? ['-m', feature.model] : []),
          ...this.effortFlag(feature.effort),
          opts.session.handle.sessionId,
          '--',
          prompt,
        ]
      : [
          'exec',
          '--json',
          '--skip-git-repo-check',
          '--sandbox', 'workspace-write',
          ...resolveGitWritableArgs(opts.cwd),
          ...(feature.model ? ['-m', feature.model] : []),
          ...this.effortFlag(feature.effort),
          '--',
          prompt,
        ];

    const timeoutMs = Math.max(resolveRuntimeConfig(process.cwd()).toolTimeoutMs, 1_800_000);
    let code: number;
    let stdout: string;
    let stderr: string;
    const progress = createCodexProgress();
    const seenToolCalls = new Set<string>();

    try {
      ({ code, stdout, stderr } = await runCli('codex', args, {
        cwd: opts.cwd,
        timeoutMs,
        signal: opts.signal,
        idleThresholdMs: resolveRuntimeConfig(opts.cwd).idleThresholdMs,
        runId: opts.runId,
        featureId: feature.id,
        tool: feature.tool,
        heartbeatSuffix: () => progress.heartbeatSuffix(),
        progressSnapshot: () => progress.heartbeatSuffix(),
        onHeartbeat: (message) => { emitRunOutput(opts.runId, feature, message, 'stderr', 'heartbeat'); },
        onStatus: opts.onStatus ?? ((snapshot): void => { msqEventBus.emit('run:status', snapshot); }),
        onStdoutLine: (line) => {
          const update = progress.onStdoutLine(line);
          if (update.output) emitRunOutput(opts.runId, feature, update.output.line, 'stdout', update.output.source);
          if (update.usage) emitUsage(opts.runId, feature, update.usage);
          if (update.toolCall) emitToolCall(opts, feature, update.toolCall, seenToolCalls);
        },
        onStderrLine: (line) => {
          const update = progress.onStderrLine(line);
          if (update.output) emitRunOutput(opts.runId, feature, update.output.line, 'stderr', update.output.source);
          if (update.toolCall) emitToolCall(opts, feature, update.toolCall, seenToolCalls);
        },
      }));
    } catch (error) {
      if (error instanceof CliTimeoutError) {
        const touchedFiles = detectTouchedFiles(opts.cwd);
        const partial = summarizePartialOutput(error.stdout, error.stderr, touchedFiles);
        const usage = this.parseUsage?.(error.stdout) ?? undefined;
        if (usage) emitUsage(opts.runId, feature, usage);
        return {
          ok: false,
          summary: `timeout após ${String(Math.round(error.runtimeMs / 1000))}s. ${partial}`,
          usage,
          timeout: {
            timeoutMs: error.timeoutMs,
            runtimeMs: error.runtimeMs,
            ...(error.lastProgress ? { lastProgress: sanitizeTimeoutProgress(error.lastProgress) } : {}),
          },
        };
      }
      if (error instanceof CliAbortError) {
        const usage = this.parseUsage?.(error.stdout) ?? undefined;
        if (usage) emitUsage(opts.runId, feature, usage);
        return {
          ok: false,
          aborted: true,
          summary: `abortado manualmente após ${String(Math.round(error.runtimeMs / 1000))}s`,
          usage,
        };
      }
      throw error;
  }

    if (code !== 0) {
      const stdoutError = lastCodexError(stdout);
      return { ok: false, summary: stdoutError || stderr.slice(-500) || `exit ${String(code)}` };
    }

    const finalMsg = lastAgentMessage(stdout);
    const usage = this.parseUsage?.(stdout) ?? undefined;
    const session = buildCodexSessionHandle(stdout, opts, opts.runId);
    const control = parseControlSignal(finalMsg);
    if (usage) emitUsage(opts.runId, feature, usage);
    return {
      ok: true,
      summary: finalMsg.slice(0, 200),
      usage,
      ...(control ? { control } : {}),
      ...(session ? { session } : {}),
    };
  },

  parseUsage(transcript: string): TokenUsage | null {
    let usage: TokenUsage | null = null;
    for (const line of transcript.split('\n')) {
      const evt = safeJson<CodexEvent>(line);
      if (evt?.type === 'turn.completed' && evt.usage) {
        const input = evt.usage.input_tokens ?? 0;
        const cachedInput = evt.usage.cached_input_tokens ?? 0;
        const output = (evt.usage.output_tokens ?? 0) + (evt.usage.reasoning_output_tokens ?? 0);
        usage = { input, cachedInput, output, total: input + cachedInput + output };
      }
    }
    return usage;
  },
};

function resolveGitWritableArgs(cwd: string): string[] {
  const gitDir = join(cwd, '.git');
  return existsSync(gitDir) ? ['--add-dir', gitDir] : [];
}

function sanitizeTimeoutProgress(value: string): string {
  return value.split('').filter((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function lastAgentMessage(transcript: string): string {
  let msg = '';
  for (const line of transcript.split('\n')) {
    const evt = safeJson<CodexEvent>(line);
    if (evt?.type === 'item.completed' && evt.item?.type === 'agent_message') {
      msg = evt.item.text ?? msg;
    }
  }
  return msg;
}

function lastCodexError(transcript: string): string {
  let msg = '';
  for (const line of transcript.split('\n')) {
    const evt = safeJson<CodexEvent>(line);
    const error = summarizeCodexErrorEvent(evt);
    if (error) msg = error;
  }
  return msg;
}

function buildCodexSessionHandle(
  transcript: string,
  opts: RunFeatureOptions,
  runId: number,
): SessionHandle | null {
  const threadId = extractCodexThreadId(transcript) ?? opts.session?.handle?.sessionId;
  if (!threadId) return null;
  return {
    tool: 'codex',
    sessionId: threadId,
    capturedFromRunId: runId,
    capturedAt: new Date().toISOString(),
  };
}

function extractCodexThreadId(transcript: string): string | null {
  let threadId: string | null = null;
  for (const line of transcript.split('\n')) {
    const evt = safeJson<CodexEvent>(line);
    if (evt?.type === 'thread.started' && typeof evt.thread_id === 'string' && evt.thread_id.trim()) {
      threadId = evt.thread_id;
    }
  }
  return threadId;
}

function summarizePartialOutput(stdout: string, stderr: string, touchedFiles: string[]): string {
  const touchedSummary = formatTouchedFiles(touchedFiles);
  const finalMsg = lastAgentMessage(stdout);
  if (finalMsg) {
    return touchedSummary
      ? `última mensagem do agente: ${finalMsg.slice(0, 160)}. ${touchedSummary}`
      : `última mensagem do agente: ${finalMsg.slice(0, 160)}`;
  }

  const stdoutError = lastCodexError(stdout);
  if (stdoutError) {
    return touchedSummary ? `erro final: ${stdoutError}. ${touchedSummary}` : `erro final: ${stdoutError}`;
  }

  const stderrTail = stderr.trim().slice(-160);
  if (stderrTail) {
    return touchedSummary ? `stderr final: ${stderrTail}. ${touchedSummary}` : `stderr final: ${stderrTail}`;
  }

  const stdoutTail = stdout.trim().slice(-160);
  if (stdoutTail) {
    return touchedSummary ? `stdout final: ${stdoutTail}. ${touchedSummary}` : `stdout final: ${stdoutTail}`;
  }

  if (touchedSummary) return touchedSummary;
  return 'sem saída útil capturada.';
}

function safeJson<T>(s: string): T | null { // eslint-disable-line @typescript-eslint/no-unnecessary-type-parameters
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function detectTouchedFiles(cwd: string): string[] {
  try {
    const output = execFileSync(
      'git',
      ['status', '--short', '--untracked-files=all'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return output
      .split('\n')
      .map((line) => parseGitStatusPath(line))
      .filter((path): path is string => Boolean(path));
  } catch {
    return [];
  }
}

function parseGitStatusPath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const statusPayload = line.slice(3).trim();
  if (!statusPayload) return trimmed;
  const renamed = statusPayload.split(' -> ');
  return renamed[renamed.length - 1] ?? statusPayload;
}

function formatTouchedFiles(files: string[]): string {
  if (files.length === 0) return '';
  const shown = files.slice(0, 5).join(', ');
  const remaining = files.length - Math.min(files.length, 5);
  return remaining > 0
    ? `arquivos tocados: ${shown} (+${String(remaining)})`
    : `arquivos tocados: ${shown}`;
}

interface ProgressUpdate {
  output?: {
    line: string;
    source: 'agent' | 'tool' | 'stderr';
  };
  usage?: TokenUsage;
  toolCall?: Omit<ToolCallRecord, 'runId' | 'featureId' | 'tool'>;
}

function createCodexProgress(): {
  onStdoutLine: (line: string) => ProgressUpdate;
  onStderrLine: (line: string) => ProgressUpdate;
  heartbeatSuffix: () => string | undefined;
} {
  let eventCount = 0;
  let lastEventType = '';
  let lastAgentSnippet = '';
  let lastErrorSnippet = '';
  let lastToolSnippet = '';
  let lastStderrSnippet = '';

  return {
    onStdoutLine(line: string): ProgressUpdate {
      const evt = safeJson<CodexEvent>(line);
      if (!evt?.type) return {};
      eventCount += 1;
      lastEventType = evt.type;

      if (evt.type === 'turn.completed' && evt.usage) {
        const input = evt.usage.input_tokens ?? 0;
        const cachedInput = evt.usage.cached_input_tokens ?? 0;
        const output = (evt.usage.output_tokens ?? 0) + (evt.usage.reasoning_output_tokens ?? 0);
        return { usage: { input, cachedInput, output, total: input + cachedInput + output } };
      }

      if (evt.type === 'item.completed' && evt.item?.type === 'agent_message') {
        const text = normalizeSnippet(evt.item.text);
        if (!text) return {};
        lastAgentSnippet = text;
        return {
          output: {
            line: text,
            source: 'agent',
          },
        };
      }

      const errorLine = summarizeCodexErrorEvent(evt);
      if (errorLine) {
        lastErrorSnippet = errorLine;
        return {
          output: {
            line: errorLine,
            source: 'tool',
          },
        };
      }

      const toolLine = summarizeCodexToolEvent(evt);
      if (toolLine) {
        lastToolSnippet = toolLine;
        return {
          output: {
            line: toolLine,
            source: 'tool',
          },
          toolCall: normalizeCodexToolCall(evt, eventCount),
        };
      }

      return {};
    },
    onStderrLine(line: string): ProgressUpdate {
      const text = normalizeSnippet(line);
      if (!text) return {};
      lastStderrSnippet = text;
      return {
        output: {
          line: text,
          source: 'stderr',
        },
      };
    },
    heartbeatSuffix(): string | undefined {
      const parts: string[] = [];
      if (eventCount > 0) parts.push(`eventos=${String(eventCount)}`);
      if (lastEventType) parts.push(`último=${lastEventType}`);
      if (lastAgentSnippet) parts.push(`agente="${lastAgentSnippet}"`);
      else if (lastErrorSnippet) parts.push(`erro="${lastErrorSnippet}"`);
      else if (lastToolSnippet) parts.push(`tool="${lastToolSnippet}"`);
      else if (lastStderrSnippet) parts.push(`stderr="${lastStderrSnippet}"`);
      return parts.length > 0 ? `[${parts.join(' | ')}]` : undefined;
    },
  };
}

function normalizeCodexToolCall(evt: CodexEvent, sequence: number): Omit<ToolCallRecord, 'runId' | 'featureId' | 'tool'> {
  const item = evt.item ?? {};
  const phase: ToolCallRecord['phase'] = evt.type === 'item.started' ? 'started' : 'completed';
  const name = normalizeSnippet(item.name ?? item.tool_name ?? item.type ?? 'unknown');
  const id = normalizeSnippet((item as { id?: string; call_id?: string }).id ?? (item as { call_id?: string }).call_id ?? `${name}-${String(sequence)}`);
  const value = item.arguments ?? item.input ?? null;
  const output = normalizeSnippet(item.output ?? item.result ?? item.aggregated_output ?? '') || null;
  return { id, sequence, phase, name, arguments: value, output, step: null, startedAt: new Date().toISOString(), completedAt: phase === 'started' ? null : new Date().toISOString(), error: null };
}

function emitToolCall(opts: RunFeatureOptions, feature: Feature, partial: Omit<ToolCallRecord, 'runId' | 'featureId' | 'tool'>, seen: Set<string>): void {
  const record = sanitizeToolCallRecord({ ...partial, runId: opts.runId, featureId: feature.id, tool: feature.tool });
  const emit = opts.onToolCall ?? ((value): void => { msqEventBus.emit('tool:call', value); });
  if (record.phase !== 'started' && !seen.has(record.id)) emit({ ...record, phase: 'started', completedAt: null });
  seen.add(record.id);
  emit(record);
}

function normalizeSnippet(text: unknown): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 140); // eslint-disable-line @typescript-eslint/no-base-to-string
}

function summarizeCodexToolEvent(evt: CodexEvent): string | null {
  if (evt.type !== 'item.completed') return null;
  const item = evt.item;
  if (!item || item.type === 'agent_message') return null;
  if (item.type === 'command_execution') {
    return summarizeCommandExecution(item);
  }

  const label = normalizeSnippet(item.name ?? item.tool_name ?? item.type ?? '');
  const payload = serializeToolPayload(item.arguments ?? item.input ?? item.output ?? item.result);
  if (!label && !payload) return null;
  return normalizeSnippet(payload ? `tool ${(label || item.type) ?? 'unknown'} ${payload}` : `tool ${label}`);
}

function summarizeCommandExecution(item: CodexEvent['item']): string | null {
  if (!item) return null;
  const command = normalizeSnippet(item.command ?? '');
  const output = normalizeSnippet(item.aggregated_output ?? '');
  const exitCode = typeof item.exit_code === 'number' ? item.exit_code : null;
  if (!command && !output) return null;
  if (output) {
    return normalizeSnippet(`shell ${command} -> ${output}`);
  }
  if (exitCode !== null) {
    return normalizeSnippet(`shell ${command} (exit ${String(exitCode)})`);
  }
  return normalizeSnippet(`shell ${command}`);
}

function serializeToolPayload(payload: unknown): string {
  if (typeof payload === 'string') return normalizeSnippet(payload);
  if (!payload) return '';
  try {
    return normalizeSnippet(JSON.stringify(payload));
  } catch {
    return normalizeSnippet(String(payload)); // eslint-disable-line @typescript-eslint/no-base-to-string
  }
}

function summarizeCodexErrorEvent(evt: CodexEvent | null): string | null {
  if (!evt?.type) return null;

  if (evt.type === 'error' || evt.type === 'turn.failed') {
    const message = normalizeSnippet(evt.error?.message ?? evt.message);
    return message ? `error ${message}` : 'error';
  }

  if (evt.type === 'item.completed' && evt.item?.type === 'error') {
    const message = normalizeSnippet(evt.item.message ?? evt.item.text);
    return message ? `error ${message}` : 'error';
  }

  return null;
}

function emitRunOutput(
  runId: number,
  feature: Feature,
  line: string,
  stream: 'stdout' | 'stderr',
  source: 'agent' | 'tool' | 'stderr' | 'heartbeat',
): void {
  msqEventBus.emit('run:output', {
    runId,
    featureId: feature.id,
    tool: feature.tool,
    line,
    stream,
    source,
  });
}

function emitUsage(runId: number, feature: Feature, usage: TokenUsage): void {
  msqEventBus.emit('tokens:update', {
    runId,
    featureId: feature.id,
    tool: feature.tool,
    input: usage.input,
    output: usage.output,
    total: usage.total,
    ...(usage.cachedInput !== undefined ? { cachedInput: usage.cachedInput } : {}),
  });
}
