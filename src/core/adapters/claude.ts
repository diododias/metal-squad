import { execFileSync } from 'node:child_process';
import type { ToolAdapter, RunResult, TokenUsage, RunFeatureOpts } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { CliTimeoutError, runCli } from './spawn.js';

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

  async runFeature(feature: Feature, prompt: string, cwd: string, opts?: RunFeatureOpts): Promise<RunResult> {
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
    const progress = createClaudeProgress(feature.id, opts?.onOutput);

    try {
      ({ code, stdout, stderr } = await runCli('claude', args, {
        cwd,
        heartbeatMs: 30_000,
        logLabel: `claude ${feature.id}`,
        heartbeatSuffix: () => progress.heartbeatSuffix(),
        onStdoutLine: (line) => progress.onStdoutLine(line),
        onStderrLine: (line) => progress.onStderrLine(line),
      }));
    } catch (error) {
      if (error instanceof CliTimeoutError) {
        const touchedFiles = detectTouchedFiles(cwd);
        const partial = summarizePartialOutput(error.stdout, error.stderr, touchedFiles);
        return {
          ok: false,
          summary: `timeout após ${Math.round(error.runtimeMs / 1000)}s. ${partial}`,
          usage: this.parseUsage?.(error.stdout) ?? undefined,
        };
      }
      throw error;
    }

    if (code !== 0) {
      const partial = summarizePartialOutput(stdout, stderr, detectTouchedFiles(cwd));
      return { ok: false, summary: `exit ${code}. ${partial}` };
    }

    const json = safeJson<ClaudeJson>(stdout);
    return {
      ok: json?.subtype !== 'error_max_turns' && code === 0,
      summary: (json?.result ?? '').slice(0, 200),
      usage: this.parseUsage?.(stdout) ?? undefined,
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

function createClaudeProgress(
  featureId: string,
  onOutput?: (line: string, stream: 'stdout' | 'stderr') => void,
): {
  onStdoutLine: (line: string) => void;
  onStderrLine: (line: string) => void;
  heartbeatSuffix: () => string | undefined;
} {
  let stdoutCount = 0;
  let stderrCount = 0;
  let lastAgentSnippet = '';
  let lastStderrSnippet = '';

  return {
    onStdoutLine(line: string) {
      const text = summarizeClaudeLine(line);
      if (!text) return;
      stdoutCount += 1;
      lastAgentSnippet = text;
      if (onOutput) {
        onOutput(text, 'stdout');
      } else {
        console.log(`[msq] claude ${featureId} agente: ${text}`);
      }
    },
    onStderrLine(line: string) {
      const text = normalizeSnippet(line);
      if (!text) return;
      stderrCount += 1;
      lastStderrSnippet = text;
      if (onOutput) {
        onOutput(text, 'stderr');
      } else {
        console.log(`[msq] claude ${featureId} stderr: ${text}`);
      }
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
