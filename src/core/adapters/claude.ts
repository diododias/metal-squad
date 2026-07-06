import { execFileSync } from 'node:child_process';
import type { ToolAdapter, RunResult, RunFeatureOptions, TokenUsage } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { CliTimeoutError, runCli } from './spawn.js';
import { msqEventBus } from '../events/index.js';

// Sem flag nativa de "effort": mapeia para o tier de modelo.
const EFFORT_MODEL: Record<Effort, string> = {
  low: 'haiku',
  medium: 'sonnet',
  high: 'opus',
};

interface ClaudeJson {
  result?: string;
  subtype?: string;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export const claudeAdapter: ToolAdapter = {
  tool: 'claude',

  effortFlag(effort: Effort): string[] {
    return ['--model', EFFORT_MODEL[effort]];
  },

  async runFeature(feature: Feature, prompt: string, opts: RunFeatureOptions): Promise<RunResult> {
    const model = feature.model ? ['--model', feature.model] : this.effortFlag(feature.effort);
    const args = [
      '-p', prompt,
      '--output-format', 'json',
      '--dangerously-skip-permissions',
      ...model,
    ];

    let code: number;
    let stdout: string;
    let stderr: string;
    const progress = createClaudeProgress(feature.id);

    try {
      ({ code, stdout, stderr } = await runCli('claude', args, {
        cwd: opts.cwd,
        heartbeatMs: 30_000,
        logLabel: `claude ${feature.id}`,
        heartbeatSuffix: () => progress.heartbeatSuffix(),
        onHeartbeat: (message) => emitRunOutput(opts.runId, feature, message, 'stderr', 'heartbeat'),
        onStdoutLine: (line) => {
          const output = progress.onStdoutLine(line);
          if (output) emitRunOutput(opts.runId, feature, output, 'stdout', 'agent');
        },
        onStderrLine: (line) => {
          const output = progress.onStderrLine(line);
          if (output) emitRunOutput(opts.runId, feature, output, 'stderr', 'stderr');
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
      throw error;
    }

    if (code !== 0) {
      const partial = summarizePartialOutput(stdout, stderr, detectTouchedFiles(opts.cwd));
      return { ok: false, summary: `exit ${code}. ${partial}` };
    }

    const json = safeJson<ClaudeJson>(stdout);
    const usage = this.parseUsage?.(stdout) ?? undefined;
    if (usage) emitUsage(opts.runId, feature, usage);
    return {
      ok: json?.subtype !== 'error_max_turns' && code === 0,
      summary: (json?.result ?? '').slice(0, 200),
      usage,
    };
  },

  parseUsage(transcript: string): TokenUsage | null {
    const json = safeJson<ClaudeJson>(transcript);
    if (!json?.usage) return null;
    const input = json.usage.input_tokens ?? 0;
    const output = json.usage.output_tokens ?? 0;
    return { input, output, total: input + output };
  },
};

function safeJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function lastAgentMessage(transcript: string): string {
  return normalizeSnippet(safeJson<ClaudeJson>(transcript)?.result ?? '');
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
    ? `arquivos tocados: ${shown} (+${remaining})`
    : `arquivos tocados: ${shown}`;
}

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function createClaudeProgress(featureId: string): {
  onStdoutLine: (line: string) => string | null;
  onStderrLine: (line: string) => string | null;
  heartbeatSuffix: () => string | undefined;
} {
  let stdoutCount = 0;
  let stderrCount = 0;
  let lastAgentSnippet = '';
  let lastStderrSnippet = '';

  return {
    onStdoutLine(line: string) {
      const text = summarizeClaudeLine(line);
      if (!text) return null;
      stdoutCount += 1;
      lastAgentSnippet = text;
      return text;
    },
    onStderrLine(line: string) {
      const text = normalizeSnippet(line);
      if (!text) return null;
      stderrCount += 1;
      lastStderrSnippet = text;
      return text;
    },
    heartbeatSuffix() {
      const parts: string[] = [];
      if (stdoutCount > 0) parts.push(`stdout=${stdoutCount}`);
      if (stderrCount > 0) parts.push(`stderr=${stderrCount}`);
      if (lastAgentSnippet) parts.push(`agente="${lastAgentSnippet}"`);
      else if (lastStderrSnippet) parts.push(`stderr="${lastStderrSnippet}"`);
      return parts.length > 0 ? `[${parts.join(' | ')}]` : undefined;
    },
  };
}

function summarizeClaudeLine(line: string): string {
  const json = safeJson<ClaudeJson>(line);
  if (json) {
    const result = normalizeSnippet(json.result ?? '');
    if (result) return result;
    const subtype = normalizeSnippet(json.subtype ?? '');
    if (subtype) return subtype;
  }
  return normalizeSnippet(line);
}

function emitRunOutput(
  runId: number,
  feature: Feature,
  line: string,
  stream: 'stdout' | 'stderr',
  source: 'agent' | 'stderr' | 'heartbeat',
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
  });
}
