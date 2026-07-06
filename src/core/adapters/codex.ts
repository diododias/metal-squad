import type { ToolAdapter, RunResult, TokenUsage } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../../config/index.js';
import { CliTimeoutError, runCli } from './spawn.js';
import { buildSpecKitPrompt } from '../backlog/prompt.js';

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

  async runFeature(feature: Feature, cwd: string): Promise<RunResult> {
    const args = [
      'exec',
      buildSpecKitPrompt(feature),
      '--json',
      '--skip-git-repo-check',
      '--full-auto', // troque por --dangerously-bypass-approvals-and-sandbox se precisar 100% unattended
      ...(feature.model ? ['-m', feature.model] : []),
      ...this.effortFlag(feature.effort),
    ];

    const timeoutMs = Math.max(loadConfig().toolTimeoutMs, 1_800_000);
    let code: number;
    let stdout: string;
    let stderr: string;
    const progress = createCodexProgress(feature.id);

    try {
      ({ code, stdout, stderr } = await runCli('codex', args, {
        cwd,
        timeoutMs,
        heartbeatMs: 30_000,
        logLabel: `codex ${feature.id}`,
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

    if (code !== 0) return { ok: false, summary: stderr.slice(-500) || `exit ${code}` };

    const finalMsg = lastAgentMessage(stdout);
    return {
      ok: true,
      summary: finalMsg.slice(0, 200),
      usage: this.parseUsage?.(stdout) ?? undefined,
    };
  },

  // JSONL: o evento turn.completed carrega usage.
  parseUsage(transcript: string): TokenUsage | null {
    let usage: TokenUsage | null = null;
    for (const line of transcript.split('\n')) {
      const evt = safeJson<any>(line);
      if (evt?.type === 'turn.completed' && evt.usage) {
        const input = (evt.usage.input_tokens ?? 0) + (evt.usage.cached_input_tokens ?? 0);
        const output = (evt.usage.output_tokens ?? 0) + (evt.usage.reasoning_output_tokens ?? 0);
        usage = { input, output, total: input + output };
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

function createCodexProgress(featureId: string): {
  onStdoutLine: (line: string) => void;
  onStderrLine: (line: string) => void;
  heartbeatSuffix: () => string | undefined;
} {
  let eventCount = 0;
  let lastEventType = '';
  let lastAgentSnippet = '';
  let lastStderrSnippet = '';

  return {
    onStdoutLine(line: string) {
      const evt = safeJson<any>(line);
      if (!evt?.type) return;
      eventCount += 1;
      lastEventType = evt.type;

      if (evt.type === 'item.completed' && evt.item?.type === 'agent_message') {
        const text = String(evt.item.text ?? '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        lastAgentSnippet = text.slice(0, 120);
        console.log(`[msq] codex ${featureId} agente: ${lastAgentSnippet}`);
      }
    },
    onStderrLine(line: string) {
      const text = line.trim();
      if (!text) return;
      lastStderrSnippet = text.slice(-120);
      console.log(`[msq] codex ${featureId} stderr: ${lastStderrSnippet}`);
    },
    heartbeatSuffix() {
      const parts: string[] = [];
      if (eventCount > 0) parts.push(`eventos=${eventCount}`);
      if (lastEventType) parts.push(`último=${lastEventType}`);
      if (lastAgentSnippet) parts.push(`agente="${lastAgentSnippet}"`);
      else if (lastStderrSnippet) parts.push(`stderr="${lastStderrSnippet}"`);
      return parts.length > 0 ? `[${parts.join(' | ')}]` : undefined;
    },
  };
}
