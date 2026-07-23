import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { detectStderrLevel, detectSessionLimit, sanitizeToolCallRecord, type SessionHandle, type ToolAdapter, type RunResult, type RunFeatureOptions, type TokenUsage, type ToolCallRecord } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { CliAbortError, CliTimeoutError, resolveToolInvocation, runCli } from './spawn.js';
import { logCaughtError } from '../events/logging.js';
import { msqEventBus } from '../events/index.js';
import { parseControlSignal } from './control.js';
import { resolveRuntimeConfig } from '../../config/index.js';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id?: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id?: string; content?: unknown; is_error?: boolean };

interface StreamUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
}

interface StreamJsonEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  sessionId?: string;
  message?: { content?: ContentBlock[]; usage?: StreamUsage };
  result?: string;
  usage?: StreamUsage;
}

export const claudeAdapter: ToolAdapter = {
  tool: 'claude',

  effortFlag(_effort: Effort): string[] {
    return [];
  },

  isAvailable(): boolean {
    try {
      const invocation = resolveToolInvocation('claude');
      execFileSync(invocation.command, invocation.versionCheck, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },

  async runFeature(feature: Feature, prompt: string, opts: RunFeatureOptions): Promise<RunResult> {
    const invocation = resolveToolInvocation(feature.tool, opts.cwd);
    const model = feature.model ? ['--model', feature.model] : [];
    const maxThinkingTokens = feature.thinking === 'on' ? invocation.thinkingBudget[feature.effort] : 0;
    const assignedSessionId = opts.session?.mode === 'resume'
      ? opts.session.handle?.sessionId ?? null
      : randomUUID();
    const args = [
      ...invocation.baseArgs,
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      ...(opts.session?.mode === 'resume' && assignedSessionId ? ['--resume', assignedSessionId] : []),
      ...(opts.session?.mode !== 'resume' && assignedSessionId ? ['--session-id', assignedSessionId] : []),
      ...model,
      '--',
      prompt,
    ];

    let code: number;
    let stdout: string;
    let stderr: string;
    const progress = createClaudeProgress();
    const seenToolCalls = new Set<string>();
    const runtime = resolveRuntimeConfig(opts.cwd);
    const timeoutMs = Math.max(runtime.toolTimeoutMs, invocation.minTimeoutMs);

    msqEventBus.emit('task:started', {
      runId: opts.runId,
      featureId: feature.id,
      taskId: feature.id,
      title: feature.id,
    });

    try {
      ({ code, stdout, stderr } = await runCli(invocation.command, args, {
        cwd: opts.cwd,
        env: { ...invocation.env, MAX_THINKING_TOKENS: String(maxThinkingTokens) },
        timeoutMs,
        idleThresholdMs: runtime.idleThresholdMs,
        heartbeatMs: runtime.heartbeatMs,
        runId: opts.runId,
        featureId: feature.id,
        tool: feature.tool,
        heartbeatSuffix: () => progress.heartbeatSuffix(),
        progressSnapshot: () => progress.heartbeatSuffix(),
        onHeartbeat: (message) => { emitRunOutput(opts.runId, feature, message, 'stderr', 'heartbeat'); },
        onStatus: opts.onStatus ?? ((snapshot): void => { msqEventBus.emit('run:status', snapshot); }),
        signal: opts.signal,
        onStdoutLine: (line) => {
          const updates = progress.onStdoutLine(line, opts.stageSkills ?? {});
          for (const update of updates) {
            if (update.output) emitRunOutput(opts.runId, feature, update.output.line, 'stdout', update.output.source, update.output);
            if (update.usage) emitUsage(opts.runId, feature, update.usage);
            if (update.stage) emitTaskStage(opts.runId, feature, update.stage);
            if (update.toolCall) emitToolCall(opts, feature, update.toolCall, seenToolCalls);
          }
        },
        onStderrLine: (line) => {
          const updates = progress.onStderrLine(line);
          for (const update of updates) {
            if (update.output) emitRunOutput(opts.runId, feature, update.output.line, 'stderr', update.output.source, update.output);
            if (update.toolCall) emitToolCall(opts, feature, update.toolCall, seenToolCalls);
          }
        },
      }));
    } catch (error) {
      if (error instanceof CliTimeoutError) {
        const touchedFiles = detectTouchedFiles(opts.cwd);
        const partial = summarizePartialOutput(error.stdout, error.stderr, touchedFiles);
        const usage = this.parseUsage?.(error.stdout) ?? undefined;
        if (usage) emitUsage(opts.runId, feature, usage);
        const session = buildClaudeSessionHandle(error.stdout, assignedSessionId, opts.runId);
        return {
          ok: false,
          summary: `timeout após ${String(Math.round(error.runtimeMs / 1000))}s. ${partial}`,
          usage,
          timeout: {
            timeoutMs: error.timeoutMs,
            runtimeMs: error.runtimeMs,
            ...(error.lastProgress ? { lastProgress: sanitizeTimeoutProgress(error.lastProgress) } : {}),
          },
          ...(session ? { session } : {}),
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
      const limitMessage = detectSessionLimit(stdout, stderr);
      if (limitMessage) {
        return { ok: false, blocked: true, summary: `session limit reached: ${limitMessage}` };
      }
      const partial = summarizePartialOutput(stdout, stderr, detectTouchedFiles(opts.cwd));
      return { ok: false, summary: `exit ${String(code)}. ${partial}` };
    }

    const resultEvent = findResultEvent(stdout);
    const usage = this.parseUsage?.(stdout) ?? undefined;
    const session = buildClaudeSessionHandle(stdout, assignedSessionId, opts.runId);
    const control = parseControlSignal(resultEvent?.result ?? '');
    if (usage) emitUsage(opts.runId, feature, usage);

    // A well-formed protocol control signal is authoritative proof the session
    // closed cleanly; only fall back to the session-limit text heuristic when
    // there is none, since it can false-positive on incidental matches (e.g. a
    // `git log` tool result mentioning "session limit" in a commit message).
    if (!control) {
      const limitMessage = detectSessionLimit(stdout, stderr);
      if (limitMessage) {
        return {
          ok: false,
          blocked: true,
          summary: `session limit reached: ${limitMessage}`,
          usage,
          ...(session ? { session } : {}),
        };
      }
    }

    return {
      ok: resultEvent?.subtype !== 'error_max_turns',
      summary: (resultEvent?.result ?? '').slice(0, 200),
      usage,
      ...(control ? { control } : {}),
      ...(session ? { session } : {}),
    };
  },

  parseUsage(transcript: string): TokenUsage | null {
    const evt = findResultEvent(transcript);
    if (!evt?.usage) return null;
    // In `result` events, `input_tokens` is already the non-cached new input;
    // `cache_read_input_tokens` is session-cumulative cached reads.
    const input = evt.usage.input_tokens ?? 0;
    const cachedInput = evt.usage.cache_read_input_tokens ?? 0;
    const output = evt.usage.output_tokens ?? 0;
    return { input, cachedInput, output, total: input + cachedInput + output };
  },
};

function sanitizeTimeoutProgress(value: string): string {
  return value.split('').filter((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function safeJson<T>(s: string): T | null { // eslint-disable-line @typescript-eslint/no-unnecessary-type-parameters
  try {
    return JSON.parse(s) as T;
  } catch (error) {
    logCaughtError('adapters/claude.safeJson', error);
    return null;
  }
}

function findResultEvent(transcript: string): StreamJsonEvent | null {
  let last: StreamJsonEvent | null = null;
  for (const line of transcript.split('\n')) {
    const evt = safeJson<StreamJsonEvent>(line);
    if (evt?.type === 'result') last = evt;
  }
  return last;
}

function findClaudeSessionId(transcript: string): string | null {
  for (const line of transcript.split('\n')) {
    const evt = safeJson<StreamJsonEvent>(line);
    const sessionId = evt?.session_id ?? evt?.sessionId;
    if (typeof sessionId === 'string' && sessionId.trim().length > 0) return sessionId;
  }
  return null;
}

function buildClaudeSessionHandle(
  transcript: string,
  assignedSessionId: string | null,
  runId: number,
): SessionHandle | null {
  const sessionId = findClaudeSessionId(transcript) ?? assignedSessionId;
  if (!sessionId) return null;
  return {
    tool: 'claude',
    sessionId,
    capturedFromRunId: runId,
    capturedAt: new Date().toISOString(),
  };
}

function lastAgentMessage(transcript: string): string {
  return normalizeSnippet(findResultEvent(transcript)?.result ?? '');
}

function summarizePartialOutput(stdout: string, stderr: string, touchedFiles: string[]): string {
  const touchedSummary = formatTouchedFiles(touchedFiles);
  const finalMsg = lastAgentMessage(stdout);
  if (finalMsg) {
    return touchedSummary
      ? `última mensagem do agente: ${finalMsg}. ${touchedSummary}`
      : `última mensagem do agente: ${finalMsg}`;
  }

  const stderrTail = normalizeSnippet(stderr);
  if (stderrTail) {
    return touchedSummary ? `stderr final: ${stderrTail}. ${touchedSummary}` : `stderr final: ${stderrTail}`;
  }

  const stdoutTail = normalizeSnippet(stdout);
  if (stdoutTail) {
    return touchedSummary ? `stdout final: ${stdoutTail}. ${touchedSummary}` : `stdout final: ${stdoutTail}`;
  }

  if (touchedSummary) return touchedSummary;
  return 'sem saída útil capturada.';
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
  } catch (error) {
    logCaughtError('adapters/claude.detectTouchedFiles', error);
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

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

interface ProgressUpdate {
  output?: {
    line: string;
    source: 'agent' | 'tool' | 'stderr';
    toolName?: string;
    level?: 'error' | 'warn';
  };
  usage?: TokenUsage;
  /** true quando `usage` ja e o total autoritativo (evento `result`). */
  usageTotal?: boolean;
  stage?: string;
  toolCall?: Omit<ToolCallRecord, 'runId' | 'featureId' | 'tool'>;
}

function createClaudeProgress(): {
  onStdoutLine: (line: string, stageSkills: Record<string, string[]>) => ProgressUpdate[];
  onStderrLine: (line: string) => ProgressUpdate[];
  heartbeatSuffix: () => string | undefined;
} {
  let eventCount = 0;
  let stderrCount = 0;
  let lastAgentSnippet = '';
  let lastToolSnippet = '';
  let lastStderrSnippet = '';
  // Acumula uso ao longo do stream para consumo de tokens em tempo real: os
  // eventos `assistant` trazem uso por mensagem (delta de output; input e o
  // contexto da vez); o evento `result` traz o total autoritativo no fim.
  let cumulativeOutput = 0;
  let latestInput = 0;
  let latestCachedInput = 0;

  return {
    onStdoutLine(line: string, stageSkills: Record<string, string[]>): ProgressUpdate[] {
      const updates = parseClaudeLine(line, stageSkills);
      for (const u of updates) {
        if (u.output) {
          eventCount += 1;
          if (u.output.source === 'tool') lastToolSnippet = u.output.line;
          else if (u.output.source === 'agent') lastAgentSnippet = u.output.line;
        }
        if (u.usage) {
          if (u.usageTotal) {
            // Total final do evento `result`: passa a valer como base acumulada.
            cumulativeOutput = u.usage.output;
            latestInput = u.usage.input;
            latestCachedInput = u.usage.cachedInput ?? 0;
          } else {
            cumulativeOutput += u.usage.output;
            if (u.usage.input > 0) latestInput = u.usage.input;
            if ((u.usage.cachedInput ?? 0) > 0) latestCachedInput = u.usage.cachedInput ?? 0;
            u.usage = {
              input: latestInput,
              cachedInput: latestCachedInput,
              output: cumulativeOutput,
              total: latestInput + latestCachedInput + cumulativeOutput,
            };
          }
        }
      }
      return updates;
    },
    onStderrLine(line: string): ProgressUpdate[] {
      const text = normalizeSnippet(line);
      if (!text) return [];
      stderrCount += 1;
      lastStderrSnippet = text;
      return [{ output: { line: text, source: 'stderr', level: detectStderrLevel(line) } }];
    },
    heartbeatSuffix(): string | undefined {
      const parts: string[] = [];
      if (eventCount > 0) parts.push(`eventos=${String(eventCount)}`);
      if (stderrCount > 0) parts.push(`stderr=${String(stderrCount)}`);
      if (lastAgentSnippet) parts.push(`agente="${lastAgentSnippet}"`);
      else if (lastToolSnippet) parts.push(`tool="${lastToolSnippet}"`);
      else if (lastStderrSnippet) parts.push(`stderr="${lastStderrSnippet}"`);
      return parts.length > 0 ? `[${parts.join(' | ')}]` : undefined;
    },
  };
}

function parseClaudeLine(line: string, stageSkills: Record<string, string[]>): ProgressUpdate[] {
  const evt = safeJson<StreamJsonEvent>(line);
  if (!evt?.type) return [];

  if (evt.type === 'result') {
    if (!evt.usage) return [];
    // `result` event: `input_tokens` = new (non-cached) input only;
    // `cache_read_input_tokens` = session-cumulative cached reads.
    const input = evt.usage.input_tokens ?? 0;
    const cachedInput = evt.usage.cache_read_input_tokens ?? 0;
    const output = evt.usage.output_tokens ?? 0;
    if (input === 0 && cachedInput === 0 && output === 0) return [];
    return [{ usage: { input, cachedInput, output, total: input + cachedInput + output }, usageTotal: true }];
  }

  if (evt.type === 'assistant' && evt.message) {
    const updates: ProgressUpdate[] = [];
    for (const block of evt.message.content ?? []) {
      if (block.type === 'thinking') {
        const text = normalizeSnippet(block.thinking);
        if (text) updates.push({ output: { line: `[thinking] ${text}`, source: 'agent' } });
      } else if (block.type === 'text') {
        const text = normalizeSnippet(block.text);
        if (text) updates.push({ output: { line: text, source: 'agent' } });
      } else if (block.type === 'tool_use') {
        // `tool_use` blocks: tool calls announced by the assistant. The matching
        // `tool_result` arrives later in a `user` event (handled below); we
        // emit `phase: 'started'` here and update to `'completed' | 'failed'`
        // when the result comes back.
        const name = normalizeSnippet(block.name);
        const input = normalizeSnippet(JSON.stringify(block.input ?? {}));
        const stage = detectStageFromSkill(name, stageSkills);
        const outputLine = normalizeSnippet(`tool ${name}${input && input !== '{}' ? ` ${input}` : ''}`);
        updates.push({
          output: { line: outputLine, source: 'tool', toolName: name },
          ...(stage ? { stage } : {}),
          toolCall: {
            id: block.id ?? `${name}-${String(updates.length)}`,
            sequence: updates.length + 1,
            phase: 'started',
            name,
            arguments: block.input ?? null,
            output: null,
            step: stage ?? null,
            startedAt: new Date().toISOString(),
            completedAt: null,
            error: null,
          },
        });
      }
    }
    if (evt.message.usage) {
      const totalInput = evt.message.usage.input_tokens ?? 0;
      const cachedInput = evt.message.usage.cache_read_input_tokens ?? 0;
      const input = totalInput - cachedInput;
      const output = evt.message.usage.output_tokens ?? 0;
      if (input > 0 || cachedInput > 0 || output > 0) {
        updates.push({ usage: { input, cachedInput, output, total: input + cachedInput + output }, usageTotal: false });
      }
    }
    return updates;
  }

  // `user` events in Claude's stream-json carry `tool_result` blocks, which
  // close the lifecycle of a `tool_use` block emitted earlier in an `assistant`
  // event. Without this branch the tool call's phase stays at `'started'`
  // forever and the Live Output tab renders every claude tool call as running
  // (blue) instead of green/red. `emitToolCall` synthesizes a `'started'`
  // record first if the matching `tool_use` was never seen, so a stray result
  // still resolves to the correct terminal phase.
  if (evt.type === 'user' && evt.message) {
    const updates: ProgressUpdate[] = [];
    let sequence = 0;
    for (const block of evt.message.content ?? []) {
      if (block.type !== 'tool_result') continue;
      sequence += 1;
      const output = normalizeSnippet(JSON.stringify(block.content ?? ''));
      const isError = block.is_error === true;
      updates.push({
        output: output
          ? { line: `tool result ${output}`, source: 'tool', toolName: 'tool result', level: isError ? 'error' : undefined }
          : undefined,
        toolCall: {
          id: block.tool_use_id ?? `tool-result-${String(sequence)}`,
          sequence,
          phase: isError ? 'failed' : 'completed',
          name: 'tool result',
          arguments: null,
          output: output || null,
          step: null,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          error: isError ? output || 'tool failed' : null,
        },
      });
    }
    if (updates.length > 0) return updates;
  }

  return [];
}

function emitToolCall(opts: RunFeatureOptions, feature: Feature, partial: Omit<ToolCallRecord, 'runId' | 'featureId' | 'tool'>, seen: Set<string>): void {
  const record = sanitizeToolCallRecord({ ...partial, runId: opts.runId, featureId: feature.id, tool: feature.tool });
  const emit = opts.onToolCall ?? ((value): void => { msqEventBus.emit('tool:call', value); });
  if (record.phase !== 'started' && !seen.has(record.id)) emit({ ...record, phase: 'started', completedAt: null });
  seen.add(record.id);
  emit(record);
}

function emitRunOutput(
  runId: number,
  feature: Feature,
  line: string,
  stream: 'stdout' | 'stderr',
  source: 'agent' | 'tool' | 'stderr' | 'heartbeat',
  extra?: { toolName?: string; level?: 'error' | 'warn' },
): void {
  msqEventBus.emit('run:output', {
    runId,
    featureId: feature.id,
    tool: feature.tool,
    line,
    stream,
    source,
    createdAt: new Date().toISOString(),
    ...(extra?.toolName !== undefined ? { toolName: extra.toolName } : {}),
    ...(extra?.level !== undefined ? { level: extra.level } : {}),
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

function detectStageFromSkill(skillName: string, stageSkills: Record<string, string[]>): string | null {
  const lower = skillName.toLowerCase();
  for (const [stage, skills] of Object.entries(stageSkills)) {
    if (skills.some((skill) => lower.includes(skill.toLowerCase()))) return stage;
  }
  return null;
}

function emitTaskStage(runId: number, feature: Feature, stage: string): void {
  msqEventBus.emit('task:updated', {
    runId,
    featureId: feature.id,
    taskId: feature.id,
    status: 'running',
    stage,
  });
}
