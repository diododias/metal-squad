import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { sanitizeToolCallRecord, type SessionHandle, type ToolAdapter, type RunResult, type RunFeatureOptions, type TokenUsage, type ToolCallRecord } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { CliAbortError, CliTimeoutError, runCli } from './spawn.js';
import { msqEventBus } from '../events/index.js';
import { parseControlSignal } from './control.js';
import { resolveRuntimeConfig } from '../../config/index.js';

// Sem flag nativa de "effort": mapeia para o tier de modelo.
const EFFORT_MODEL: Record<Effort, string> = {
  low: 'haiku',
  medium: 'sonnet',
  high: 'opus',
};

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

  effortFlag(effort: Effort): string[] {
    return ['--model', EFFORT_MODEL[effort]];
  },

  isAvailable(): boolean {
    try {
      execFileSync('claude', ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },

  async runFeature(feature: Feature, prompt: string, opts: RunFeatureOptions): Promise<RunResult> {
    const model = feature.model ? ['--model', feature.model] : this.effortFlag(feature.effort);
    const assignedSessionId = opts.session?.mode === 'resume'
      ? opts.session.handle?.sessionId ?? null
      : randomUUID();
    const args = [
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

    msqEventBus.emit('task:started', {
      runId: opts.runId,
      featureId: feature.id,
      taskId: feature.id,
      title: feature.id,
    });

    try {
      ({ code, stdout, stderr } = await runCli('claude', args, {
        cwd: opts.cwd,
        idleThresholdMs: resolveRuntimeConfig(opts.cwd).idleThresholdMs,
        runId: opts.runId,
        featureId: feature.id,
        tool: feature.tool,
        heartbeatSuffix: () => progress.heartbeatSuffix(),
        progressSnapshot: () => progress.heartbeatSuffix(),
        onHeartbeat: (message) => { emitRunOutput(opts.runId, feature, message, 'stderr', 'heartbeat'); },
        onStatus: opts.onStatus ?? ((snapshot): void => { msqEventBus.emit('run:status', snapshot); }),
        signal: opts.signal,
        onStdoutLine: (line) => {
          const updates = progress.onStdoutLine(line);
          for (const update of updates) {
            if (update.output) emitRunOutput(opts.runId, feature, update.output.line, 'stdout', update.output.source);
            if (update.usage) emitUsage(opts.runId, feature, update.usage);
            if (update.stage) emitTaskStage(opts.runId, feature, update.stage);
            if (update.toolCall) emitToolCall(opts, feature, update.toolCall, seenToolCalls);
          }
        },
        onStderrLine: (line) => {
          const updates = progress.onStderrLine(line);
          for (const update of updates) {
            if (update.output) emitRunOutput(opts.runId, feature, update.output.line, 'stderr', update.output.source);
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
      const partial = summarizePartialOutput(stdout, stderr, detectTouchedFiles(opts.cwd));
      return { ok: false, summary: `exit ${String(code)}. ${partial}` };
    }

    const resultEvent = findResultEvent(stdout);
    const usage = this.parseUsage?.(stdout) ?? undefined;
    const session = buildClaudeSessionHandle(stdout, assignedSessionId, opts.runId);
    const control = parseControlSignal(resultEvent?.result ?? '');
    if (usage) emitUsage(opts.runId, feature, usage);
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
    const totalInput = evt.usage.input_tokens ?? 0;
    const cachedInput = evt.usage.cache_read_input_tokens ?? 0;
    const input = totalInput - cachedInput;
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
  } catch {
    return null;
  }
}

function findResultEvent(transcript: string): StreamJsonEvent | null {
  for (const line of transcript.split('\n')) {
    const evt = safeJson<StreamJsonEvent>(line);
    if (evt?.type === 'result') return evt;
  }
  return null;
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

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

interface ProgressUpdate {
  output?: {
    line: string;
    source: 'agent' | 'tool' | 'stderr';
  };
  usage?: TokenUsage;
  /** true quando `usage` ja e o total autoritativo (evento `result`). */
  usageTotal?: boolean;
  stage?: string;
  toolCall?: Omit<ToolCallRecord, 'runId' | 'featureId' | 'tool'>;
}

function createClaudeProgress(): {
  onStdoutLine: (line: string) => ProgressUpdate[];
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
    onStdoutLine(line: string): ProgressUpdate[] {
      const updates = parseClaudeLine(line);
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
      return [{ output: { line: text, source: 'stderr' } }];
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

function parseClaudeLine(line: string): ProgressUpdate[] {
  const evt = safeJson<StreamJsonEvent>(line);
  if (!evt?.type) return [];

  if (evt.type === 'result') {
    if (!evt.usage) return [];
    const totalInput = evt.usage.input_tokens ?? 0;
    const cachedInput = evt.usage.cache_read_input_tokens ?? 0;
    const input = totalInput - cachedInput;
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
      } else if (block.type === 'tool_result') {
        const output = normalizeSnippet(JSON.stringify(block.content ?? ''));
        updates.push({
          output: output ? { line: `tool result ${output}`, source: 'tool' } : undefined,
          toolCall: {
            id: block.tool_use_id ?? `tool-result-${String(updates.length)}`,
            sequence: updates.length + 1,
            phase: block.is_error ? 'failed' : 'completed',
            name: 'tool result',
            arguments: null,
            output: output || null,
            step: null,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            error: block.is_error ? output || 'tool failed' : null,
          },
        });
      } else {
        const name = normalizeSnippet(block.name);
        const input = normalizeSnippet(JSON.stringify(block.input ?? {}));
        const stage = detectStageFromSkill(name);
        const outputLine = normalizeSnippet(`tool ${name}${input && input !== '{}' ? ` ${input}` : ''}`);
        updates.push({
          output: { line: outputLine, source: 'tool' },
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

const SKILL_STAGE_MAP: Record<string, string> = {
  'speckit-specify': 'specify',
  'speckit_specify': 'specify',
  'speckit-plan': 'plan',
  'speckit_plan': 'plan',
  'speckit-implement': 'implement',
  'speckit_implement': 'implement',
  'speckit-tasks': 'tasks',
  'speckit_tasks': 'tasks',
};

function detectStageFromSkill(skillName: string): string | null {
  const lower = skillName.toLowerCase();
  for (const [pattern, stage] of Object.entries(SKILL_STAGE_MAP)) {
    if (lower.includes(pattern)) return stage;
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
