import { execFileSync } from 'node:child_process';
import { logCaughtError } from '../events/logging.js';

export function normalizeSnippet(text: unknown): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim(); // eslint-disable-line @typescript-eslint/no-base-to-string
}

export function sanitizeTimeoutProgress(value: string): string {
  return value.split('').filter((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('').replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function detectTouchedFiles(cwd: string): string[] {
  try {
    const output = execFileSync(
      'git',
      ['status', '--short', '--untracked-files=all'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    if (typeof output !== 'string' || !output) return [];
    return output
      .split('\n')
      .map((line) => parseGitStatusPath(line))
      .filter((path): path is string => Boolean(path));
  } catch (error) {
    logCaughtError('adapters/partial.detectTouchedFiles', error);
    return [];
  }
}

export function parseGitStatusPath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const statusPayload = line.slice(3).trim();
  if (!statusPayload) return trimmed;
  const renamed = statusPayload.split(' -> ');
  return renamed[renamed.length - 1] ?? statusPayload;
}

export function formatTouchedFiles(files: string[]): string {
  if (files.length === 0) return '';
  const shown = files.slice(0, 5).join(', ');
  const remaining = files.length - Math.min(files.length, 5);
  return remaining > 0
    ? `arquivos tocados: ${shown} (+${String(remaining)})`
    : `arquivos tocados: ${shown}`;
}

export interface SummarizePartialOptions {
  lastAgentMessage?: string;
  lastError?: string;
  agentMessageMaxLen?: number;
}

export function summarizePartialOutput(
  stdout: string,
  stderr: string,
  touchedFiles: string[],
  opts: SummarizePartialOptions = {},
): string {
  const touchedSummary = formatTouchedFiles(touchedFiles);
  const maxLen = opts.agentMessageMaxLen;
  const finalMsg = normalizeSnippet(opts.lastAgentMessage ?? '');
  const clippedMsg = maxLen !== undefined && finalMsg.length > maxLen
    ? finalMsg.slice(0, maxLen)
    : finalMsg;

  if (clippedMsg) {
    return touchedSummary
      ? `última mensagem do agente: ${clippedMsg}. ${touchedSummary}`
      : `última mensagem do agente: ${clippedMsg}`;
  }

  const lastError = normalizeSnippet(opts.lastError ?? '');
  if (lastError) {
    return touchedSummary ? `erro final: ${lastError}. ${touchedSummary}` : `erro final: ${lastError}`;
  }

  const stderrTail = normalizeSnippet(stderr).slice(-160);
  if (stderrTail) {
    return touchedSummary ? `stderr final: ${stderrTail}. ${touchedSummary}` : `stderr final: ${stderrTail}`;
  }

  const stdoutTail = normalizeSnippet(stdout).slice(-160);
  if (stdoutTail) {
    return touchedSummary ? `stdout final: ${stdoutTail}. ${touchedSummary}` : `stdout final: ${stdoutTail}`;
  }

  if (touchedSummary) return touchedSummary;
  return 'sem saída útil capturada.';
}

export function formatTimeoutSummary(runtimeMs: number, partial: string): string {
  return `timeout após ${String(Math.round(runtimeMs / 1000))}s. ${partial}`;
}
