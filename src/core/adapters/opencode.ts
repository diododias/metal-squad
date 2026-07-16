import { execFileSync } from 'node:child_process';
import { sanitizeToolCallRecord, type SessionHandle, type ToolAdapter, type RunResult, type RunFeatureOptions, type TokenUsage, type ToolCallRecord } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { CliAbortError, resolveToolInvocation, runCli } from './spawn.js';
import { msqEventBus } from '../events/index.js';
import { parseControlSignal } from './control.js';
import { resolveRuntimeConfig } from '../../config/index.js';

interface OpenCodeUsage {
  input?: number;
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_read_input_tokens?: number;
  output?: number;
  output_tokens?: number;
}

interface OpenCodeError {
  name?: string;
  message?: string;
  data?: { message?: string };
}

interface OpenCodePart {
  type?: string;
  tool?: string;
  callID?: string;
  text?: string;
  id?: string;
  messageID?: string;
  reasoning?: string;
  input?: unknown;
  args?: unknown;
  arguments?: unknown;
  [key: string]: unknown;
}

interface OpenCodeResponse {
  type?: string;
  sessionID?: string;
  sessionId?: string;
  response?: string;
  usage?: OpenCodeUsage;
  tokens?: OpenCodeUsage;
  tool?: string;
  toolName?: string;
  input?: unknown;
  args?: unknown;
  arguments?: unknown;
  result?: string;
  message?: string;
  error?: OpenCodeError;
  part?: OpenCodePart;
}

export const opencodeAdapter: ToolAdapter = {
  tool: 'opencode',

  effortFlag(_effort: Effort): string[] {
    return [];
  },

  isAvailable(): boolean {
    try {
      const invocation = resolveToolInvocation('opencode');
      execFileSync(invocation.command, invocation.versionCheck, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },

  async runFeature(feature: Feature, prompt: string, opts: RunFeatureOptions): Promise<RunResult> {
    const invocation = resolveToolInvocation(feature.tool, opts.cwd);
    if (feature.effort !== 'medium' && !invocation.capabilities.effort) {
      emitRunOutput(
        opts.runId,
        feature,
        'aviso: opencode não suporta effort; opção ignorada.',
        'stderr',
        'heartbeat',
      );
    }
    if (feature.thinking === 'on' && !invocation.capabilities.thinking) {
      emitRunOutput(
        opts.runId,
        feature,
        'aviso: opencode não suporta thinking; opção ignorada.',
        'stderr',
        'heartbeat',
      );
    }

    const args = [
      ...invocation.baseArgs,
      'run',
      '--format', 'json',
      ...(opts.session?.mode === 'resume' && opts.session.handle ? ['--session', opts.session.handle.sessionId] : []),
      ...(feature.model ? ['--model', feature.model] : []),
      '--',
      prompt,
    ];

    let code: number;
    let stdout: string;
    let stderr: string;
    const progress = createOpenCodeProgress();
    const seenToolCalls = new Set<string>();
    const streamParser = createOpenCodeStreamParser(
      (event) => {
        const update = progress.onEvent(event);
        if (update.output) emitRunOutput(opts.runId, feature, update.output.line, 'stdout', update.output.source);
        if (update.usage) emitUsage(opts.runId, feature, update.usage);
        if (update.toolCall) emitToolCall(opts, feature, update.toolCall, seenToolCalls);
      },
      (text) => {
        const line = normalizeSnippet(text);
        if (!line) return;
        emitRunOutput(opts.runId, feature, line, 'stdout', 'stdout');
      },
    );
    try {
      ({ code, stdout, stderr } = await runCli(invocation.command, args, {
        cwd: opts.cwd,
        env: invocation.env,
        signal: opts.signal,
        heartbeatMs: resolveRuntimeConfig(opts.cwd).heartbeatMs,
        logLabel: `opencode ${feature.id}`,
        heartbeatSuffix: () => progress.heartbeatSuffix(),
        progressSnapshot: () => progress.heartbeatSuffix(),
        onHeartbeat: (message) => { emitRunOutput(opts.runId, feature, message, 'stderr', 'heartbeat'); },
        idleThresholdMs: resolveRuntimeConfig(opts.cwd).idleThresholdMs,
        runId: opts.runId,
        featureId: feature.id,
        tool: feature.tool,
        onStatus: opts.onStatus ?? ((snapshot): void => { msqEventBus.emit('run:status', snapshot); }),
        onStdoutChunk: (chunk) => { streamParser.push(chunk); },
        onStderrLine: (line) => {
          const update = progress.onStderrLine(line);
          if (!update.output) return;
          emitRunOutput(opts.runId, feature, update.output.line, 'stderr', update.output.source);
        },
      }));
    } catch (error) {
      if (isCliTimeoutError(error)) {
        const usage = this.parseUsage?.(error.stdout) ?? undefined;
        if (usage) emitUsage(opts.runId, feature, usage);
        return {
          ok: false,
          summary: `timeout após ${String(Math.round(error.runtimeMs / 1000))}s`,
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
    streamParser.flush();
    if (code !== 0) {
      const errorSummary = stderr.slice(-500) || `exit ${String(code)}`;
      console.error(`[opencode adapter] exit ${String(code)}: ${errorSummary}`);
      return { ok: false, summary: errorSummary };
    }

    const events = extractOpenCodeEvents(stdout);
    const json = safeJson<OpenCodeResponse>(stdout) ?? events[events.length - 1] ?? null;

    if (json?.type === 'error' || json?.error) {
      const errorMessage = json.error?.data?.message
        ?? json.error?.message
        ?? json.message
        ?? 'Unknown opencode error';
      const errorName = json.error?.name ?? 'UnknownError';
      console.error(`[opencode adapter] ${errorName}: ${errorMessage}`);
      return { ok: false, summary: `${errorName}: ${errorMessage}` };
    }

    const usage = this.parseUsage?.(stdout) ?? undefined;
    const finalText = getOpenCodeFinalText(events)
      || pickTextSnippet(json?.response, json?.result, json?.message)
      || stdout;
    const session = buildOpenCodeSessionHandle(events, json, opts, opts.runId);
    const control = parseControlSignal(finalText);
    if (usage) emitUsage(opts.runId, feature, usage);
    return {
      ok: true,
      summary: finalText.slice(0, 200),
      usage,
      ...(control ? { control } : {}),
      ...(session ? { session } : {}),
    };
  },

  parseUsage(transcript: string): TokenUsage | null {
    const direct = safeJson<OpenCodeResponse>(transcript);
    const directUsage = usageFromOpenCodeResponse(direct);
    if (directUsage) return directUsage;

    const events = extractOpenCodeEvents(transcript);
    let usage: TokenUsage | null = null;
    for (const event of events) {
      const next = usageFromOpenCodeResponse(event);
      if (next) usage = next;
    }
    return usage;
  },
};

function sanitizeTimeoutProgress(value: string): string {
  return value.split('').filter((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function isCliTimeoutError(error: unknown): error is {
  stdout: string;
  stderr: string;
  timeoutMs: number;
  runtimeMs: number;
  lastProgress?: string;
} {
  return error instanceof Error
    && error.name === 'CliTimeoutError'
    && typeof (error as Error & { timeoutMs?: unknown }).timeoutMs === 'number';
}

function safeJson<T>(s: string): T | null { // eslint-disable-line @typescript-eslint/no-unnecessary-type-parameters
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function pickTextSnippet(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = normalizeSnippet(value);
    if (text) return text;
  }
  return '';
}

function serializePayloadSnippet(payload: unknown): string {
  if (typeof payload === 'string') return normalizeSnippet(payload);
  if (payload == null) return '';
  try {
    return normalizeSnippet(JSON.stringify(payload));
  } catch {
    return normalizeSnippet(String(payload)); // eslint-disable-line @typescript-eslint/no-base-to-string
  }
}

function parseOpenCodeEvent(json: OpenCodeResponse): {
  output?: {
    line: string;
    source: 'agent' | 'tool' | 'stdout';
  };
  usage?: TokenUsage;
  toolCall?: Omit<ToolCallRecord, 'runId' | 'featureId' | 'tool'>;
} {
  if (json.type === 'error' || json.error) {
    const errorMsg = pickTextSnippet(
      json.error?.data?.message,
      json.error?.message,
      json.message,
    ) || 'Unknown opencode error';
    const errorName = pickTextSnippet(json.error?.name) || 'UnknownError';
    return { output: { line: `${errorName}: ${errorMsg}`, source: 'stdout' } };
  }

  const usage = opencodeAdapter.parseUsage?.(JSON.stringify(json)) ?? undefined;
  if (usage && usage.total > 0) {
    return { usage };
  }

  const part = json.part;

  const toolName = pickTextSnippet(part?.tool, json.tool, json.toolName);
  if (toolName) {
    const payload = serializePayloadSnippet(
      part?.input ?? part?.args ?? part?.arguments ?? json.input ?? json.args ?? json.arguments ?? {},
    );
    return {
      output: {
        line: normalizeSnippet(`tool ${toolName}${payload && payload !== '{}' ? ` ${payload}` : ''}`),
        source: 'tool',
      },
      toolCall: {
        id: part?.callID ?? part?.id ?? `${toolName}-${String(Date.now())}`,
        sequence: 0,
        phase: part?.type === 'tool_use' || part?.type === 'tool_start' ? 'started' : 'completed',
        name: toolName,
        arguments: part?.input ?? part?.args ?? part?.arguments ?? json.input ?? json.args ?? json.arguments ?? null,
        output: null,
        step: null,
        startedAt: new Date().toISOString(),
        completedAt: part?.type === 'tool_use' || part?.type === 'tool_start' ? null : new Date().toISOString(),
        error: null,
      },
    };
  }

  const text = pickTextSnippet(
    part?.text,
    part?.type === 'thinking' ? part.reasoning : undefined,
    json.response,
    json.result,
    json.message,
  );
  if (text) {
    return {
      output: {
        line: part?.type === 'thinking' ? `[thinking] ${text}` : text,
        source: 'agent',
      },
    };
  }

  return {};
}

function usageFromOpenCodeResponse(json: OpenCodeResponse | null): TokenUsage | null {
  const u = json?.usage ?? json?.tokens;
  if (!u) return null;
  const input = u.input ?? u.input_tokens ?? 0;
  const cachedInput = u.cached_input_tokens ?? u.cache_read_input_tokens ?? 0;
  const output = u.output ?? u.output_tokens ?? 0;
  return { input, cachedInput, output, total: input + cachedInput + output };
}

function extractOpenCodeSessionId(events: OpenCodeResponse[], fallback: OpenCodeResponse | null): string | null {
  for (const event of [...events, fallback].filter((value): value is OpenCodeResponse => value !== null)) {
    const sessionId = event.sessionID ?? event.sessionId;
    if (typeof sessionId === 'string' && sessionId.trim().length > 0) return sessionId;
  }
  return null;
}

function buildOpenCodeSessionHandle(
  events: OpenCodeResponse[],
  fallback: OpenCodeResponse | null,
  opts: RunFeatureOptions,
  runId: number,
): SessionHandle | null {
  const sessionId = extractOpenCodeSessionId(events, fallback) ?? opts.session?.handle?.sessionId;
  if (!sessionId) return null;
  return {
    tool: 'opencode',
    sessionId,
    capturedFromRunId: runId,
    capturedAt: new Date().toISOString(),
  };
}

function getOpenCodeFinalText(events: OpenCodeResponse[]): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (!event) continue;
    const text = pickTextSnippet(
      event.part?.text,
      event.part?.type === 'thinking' ? event.part.reasoning : undefined,
      event.response,
      event.result,
      event.message,
    );
    if (text) return text;
  }
  return '';
}

function extractOpenCodeEvents(transcript: string): OpenCodeResponse[] {
  const events: OpenCodeResponse[] = [];
  const parser = createOpenCodeStreamParser((event) => { events.push(event); });
  parser.push(transcript);
  parser.flush();
  return events;
}

function createOpenCodeStreamParser(
  onEvent: (event: OpenCodeResponse) => void,
  onRawText?: (text: string) => void,
): {
  push: (chunk: string) => void;
  flush: () => void;
} {
  let buffer = '';

  const emitParsedEvents = (flushRemainder = false): void => {
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let lastConsumed = 0;
    let sawNonWhitespaceBeforeObject = false;

    for (let i = 0; i < buffer.length; i += 1) {
      const char = buffer[i] ?? '';

      if (start === -1) {
        if (char === '{') {
          start = i;
          depth = 1;
          inString = false;
          escaped = false;
        } else if (!sawNonWhitespaceBeforeObject && /\s/.test(char)) {
          lastConsumed = i + 1;
        } else {
          sawNonWhitespaceBeforeObject = true;
        }
        continue;
      }

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') {
        depth += 1;
        continue;
      }
      if (char !== '}') continue;

      depth -= 1;
      if (depth !== 0) continue;

      const candidate = buffer.slice(start, i + 1);
      const parsed = safeJson<OpenCodeResponse>(candidate);
      if (parsed) onEvent(parsed);
      lastConsumed = i + 1;
      start = -1;
    }

    buffer = start === -1 ? buffer.slice(lastConsumed) : buffer.slice(start);
    if (flushRemainder && buffer.trim()) {
      const remainder = buffer;
      buffer = '';
      if (!remainder.trimStart().startsWith('{')) onRawText?.(remainder);
    }
  };

  return {
    push(chunk: string): void {
      if (!chunk) return;
      buffer += chunk;
      emitParsedEvents();
    },
    flush(): void {
      const pending = buffer;
      emitParsedEvents(true);
      if (pending.trim() && !pending.includes('{')) onRawText?.(pending);
      buffer = '';
    },
  };
}

function createOpenCodeProgress(): {
  onEvent: (event: OpenCodeResponse) => {
    output?: {
      line: string;
      source: 'agent' | 'tool' | 'stdout';
    };
    usage?: TokenUsage;
    toolCall?: Omit<ToolCallRecord, 'runId' | 'featureId' | 'tool'>;
  };
  onStderrLine: (line: string) => {
    output?: {
      line: string;
      source: 'stderr';
    };
  };
  heartbeatSuffix: () => string | undefined;
} {
  let eventCount = 0;
  let stderrCount = 0;
  let lastEventType = '';
  let lastAgentSnippet = '';
  let lastToolSnippet = '';
  let lastThinkingSnippet = '';
  let lastStderrSnippet = '';
  let toolSequence = 0;

  return {
    onEvent(event: OpenCodeResponse): {
      output?: { line: string; source: 'agent' | 'tool' | 'stdout' };
      usage?: TokenUsage;
      toolCall?: Omit<ToolCallRecord, 'runId' | 'featureId' | 'tool'>;
    } {
      eventCount += 1;
      lastEventType = pickTextSnippet(event.type, event.part?.type);
      const update = parseOpenCodeEvent(event);
      if (update.toolCall) update.toolCall.sequence = ++toolSequence;
      if (update.output?.source === 'tool') {
        lastToolSnippet = update.output.line;
      } else if (update.output?.source === 'agent') {
        lastAgentSnippet = update.output.line;
        if (update.output.line.startsWith('[thinking] ')) lastThinkingSnippet = update.output.line;
      }
      return update;
    },
    onStderrLine(line: string): { output?: { line: string; source: 'stderr' } } {
      const text = normalizeSnippet(line);
      if (!text) return {};
      stderrCount += 1;
      lastStderrSnippet = text;
      return { output: { line: text, source: 'stderr' as const } };
    },
    heartbeatSuffix(): string | undefined {
      const parts: string[] = [];
      if (eventCount > 0) parts.push(`eventos=${String(eventCount)}`);
      if (stderrCount > 0) parts.push(`stderr=${String(stderrCount)}`);
      if (lastThinkingSnippet) parts.push(`thinking="${lastThinkingSnippet}"`);
      else if (lastToolSnippet) parts.push(`tool="${lastToolSnippet}"`);
      else if (lastAgentSnippet) parts.push(`agente="${lastAgentSnippet}"`);
      if (lastEventType) parts.push(`ultimo=${lastEventType}`);
      else if (lastStderrSnippet) parts.push(`stderr="${lastStderrSnippet}"`);
      return parts.length > 0 ? `[${parts.join(' | ')}]` : undefined;
    },
  };
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
  source: 'agent' | 'tool' | 'stdout' | 'stderr' | 'heartbeat',
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
