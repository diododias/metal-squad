import type { ToolAdapter, RunResult, RunFeatureOptions, TokenUsage } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../../config/index.js';
import { CliAbortError, CliTimeoutError, runCli } from './spawn.js';
import { msqEventBus } from '../events/index.js';
import { parseControlSignal } from './control.js';

// Codex tem effort nativo via config: model_reasoning_effort.
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

  async runFeature(feature: Feature, prompt: string, opts: RunFeatureOptions): Promise<RunResult> {
    const args = [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--ask-for-approval', 'never',
      '--sandbox', 'workspace-write',
      ...(feature.model ? ['-m', feature.model] : []),
      ...this.effortFlag(feature.effort),
      '--',
      prompt,
    ];

    const timeoutMs = Math.max(loadConfig().toolTimeoutMs, 1_800_000);
    let code: number;
    let stdout: string;
    let stderr: string;
    const progress = createCodexProgress();

    try {
      ({ code, stdout, stderr } = await runCli('codex', args, {
        cwd: opts.cwd,
        timeoutMs,
        signal: opts.signal,
        heartbeatMs: 30_000,
        logLabel: `codex ${feature.id}`,
        heartbeatSuffix: () => progress.heartbeatSuffix(),
        onHeartbeat: (message) => emitRunOutput(opts.runId, feature, message, 'stderr', 'heartbeat'),
        onStdoutLine: (line) => {
          const update = progress.onStdoutLine(line);
          if (update.output) emitRunOutput(opts.runId, feature, update.output.line, 'stdout', update.output.source);
          if (update.usage) emitUsage(opts.runId, feature, update.usage);
        },
        onStderrLine: (line) => {
          const update = progress.onStderrLine(line);
          if (update.output) emitRunOutput(opts.runId, feature, update.output.line, 'stderr', update.output.source);
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
          summary: `timeout após ${Math.round(error.runtimeMs / 1000)}s. ${partial}`,
          usage,
        };
      }
      if (error instanceof CliAbortError) {
        const usage = this.parseUsage?.(error.stdout) ?? undefined;
        if (usage) emitUsage(opts.runId, feature, usage);
        return {
          ok: false,
          aborted: true,
          summary: `abortado manualmente após ${Math.round(error.runtimeMs / 1000)}s`,
          usage,
        };
      }
      throw error;
    }

    if (code !== 0) return { ok: false, summary: stderr.slice(-500) || `exit ${code}` };

    const finalMsg = lastAgentMessage(stdout);
    const usage = this.parseUsage?.(stdout) ?? undefined;
    if (usage) emitUsage(opts.runId, feature, usage);
    return {
      ok: true,
      summary: finalMsg.slice(0, 200),
      usage,
      control: parseControlSignal(finalMsg),
    };
  },

  // JSONL: o evento turn.completed carrega usage.
  parseUsage(transcript: string): TokenUsage | null {
    let usage: TokenUsage | null = null;
    for (const line of transcript.split('\n')) {
      const evt = safeJson<any>(line);
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

function lastAgentMessage(transcript: string): string {
  let msg = '';
  for (const line of transcript.split('\n')) {
    const evt = safeJson<any>(line);
    if (evt?.type === 'item.completed' && evt.item?.type === 'agent_message') {
      msg = evt.item.text ?? msg;
    }
  }
  return msg;
}

function summarizePartialOutput(stdout: string, stderr: string, touchedFiles: string[]): string {
  const touchedSummary = formatTouchedFiles(touchedFiles);
  const finalMsg = lastAgentMessage(stdout);
  if (finalMsg) {
    return touchedSummary
      ? `última mensagem do agente: ${finalMsg.slice(0, 160)}. ${touchedSummary}`
      : `última mensagem do agente: ${finalMsg.slice(0, 160)}`;
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

function safeJson<T>(s: string): T | null {
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
    ? `arquivos tocados: ${shown} (+${remaining})`
    : `arquivos tocados: ${shown}`;
}

interface ProgressUpdate {
  output?: {
    line: string;
    source: 'agent' | 'tool' | 'stderr';
  };
  usage?: TokenUsage;
}

function createCodexProgress(): {
  onStdoutLine: (line: string) => ProgressUpdate;
  onStderrLine: (line: string) => ProgressUpdate;
  heartbeatSuffix: () => string | undefined;
} {
  let eventCount = 0;
  let lastEventType = '';
  let lastAgentSnippet = '';
  let lastToolSnippet = '';
  let lastStderrSnippet = '';

  return {
    onStdoutLine(line: string) {
      const evt = safeJson<any>(line);
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

      const toolLine = summarizeCodexToolEvent(evt);
      if (toolLine) {
        lastToolSnippet = toolLine;
        return {
          output: {
            line: toolLine,
            source: 'tool',
          },
        };
      }

      return {};
    },
    onStderrLine(line: string) {
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
    heartbeatSuffix() {
      const parts: string[] = [];
      if (eventCount > 0) parts.push(`eventos=${eventCount}`);
      if (lastEventType) parts.push(`último=${lastEventType}`);
      if (lastAgentSnippet) parts.push(`agente="${lastAgentSnippet}"`);
      else if (lastToolSnippet) parts.push(`tool="${lastToolSnippet}"`);
      else if (lastStderrSnippet) parts.push(`stderr="${lastStderrSnippet}"`);
      return parts.length > 0 ? `[${parts.join(' | ')}]` : undefined;
    },
  };
}

function normalizeSnippet(text: unknown): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
}

function summarizeCodexToolEvent(evt: any): string | null {
  if (evt?.type !== 'item.completed') return null;
  const item = evt?.item;
  if (!item || item.type === 'agent_message') return null;
  if (item.type === 'command_execution') {
    return summarizeCommandExecution(item);
  }

  const label = normalizeSnippet(item.name ?? item.tool_name ?? item.type ?? '');
  const payload = serializeToolPayload(item.arguments ?? item.input ?? item.output ?? item.result);
  if (!label && !payload) return null;
  return normalizeSnippet(payload ? `tool ${label || item.type} ${payload}` : `tool ${label}`);
}

function summarizeCommandExecution(item: Record<string, unknown>): string | null {
  const command = normalizeSnippet(String(item.command ?? ''));
  const output = normalizeSnippet(String(item.aggregated_output ?? ''));
  const exitCode = typeof item.exit_code === 'number' ? item.exit_code : null;
  if (!command && !output) return null;
  if (output) {
    return normalizeSnippet(`shell ${command} -> ${output}`);
  }
  if (exitCode !== null) {
    return normalizeSnippet(`shell ${command} (exit ${exitCode})`);
  }
  return normalizeSnippet(`shell ${command}`);
}

function serializeToolPayload(payload: unknown): string {
  if (typeof payload === 'string') return normalizeSnippet(payload);
  if (!payload) return '';
  try {
    return normalizeSnippet(JSON.stringify(payload));
  } catch {
    return normalizeSnippet(String(payload));
  }
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
