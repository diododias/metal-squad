import { spawn } from 'node:child_process';
import type { SessionStatus, SessionStatusCallback } from './types.js';
import type { Tool } from '../backlog/schema.js';

export interface SpawnResult {
  code: number;
  stdout: string;
  stderr: string;
  signal: NodeJS.Signals | null;
}

export class CliTimeoutError extends Error {
  public readonly stdout: string;
  public readonly stderr: string;
  public readonly timeoutMs: number;
  public readonly runtimeMs: number;

  public constructor(
    bin: string,
    timeoutMs: number,
    runtimeMs: number,
    stdout: string,
    stderr: string,
  ) {
    super(`${bin} excedeu timeout (${String(timeoutMs)}ms)`);
    this.name = 'CliTimeoutError';
    this.stdout = stdout;
    this.stderr = stderr;
    this.timeoutMs = timeoutMs;
    this.runtimeMs = runtimeMs;
  }
}

export class CliAbortError extends Error {
  public readonly stdout: string;
  public readonly stderr: string;
  public readonly runtimeMs: number;
  public readonly signal: NodeJS.Signals | null;

  public constructor(
    bin: string,
    runtimeMs: number,
    stdout: string,
    stderr: string,
    signal: NodeJS.Signals | null,
  ) {
    super(`${bin} abortado manualmente`);
    this.name = 'CliAbortError';
    this.stdout = stdout;
    this.stderr = stderr;
    this.runtimeMs = runtimeMs;
    this.signal = signal;
  }
}

export interface SpawnOptions {
  cwd: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  heartbeatMs?: number;
  logLabel?: string;
  heartbeatSuffix?: () => string | undefined;
  onHeartbeat?: (message: string) => void;
  onStdoutChunk?: (chunk: string) => void;
  onStdoutLine?: (line: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onStderrLine?: (line: string) => void;
  runId?: number;
  featureId?: string;
  tool?: Tool;
  idleThresholdMs?: number;
  onStatus?: SessionStatusCallback;
}

export async function runCli(
  bin: string,
  args: string[],
  opts: SpawnOptions,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutPending = '';
    let stderrPending = '';
    const timeoutMs = opts.timeoutMs ?? 600_000;
    const startedAt = Date.now();
    let lastOutputAt = startedAt;
    let settled = false;
    let abortRequested = false;
    let killTimer: NodeJS.Timeout | null = null;
    const heartbeatMs = opts.heartbeatMs ?? 0;
    const idleThresholdMs = opts.idleThresholdMs ?? 30_000;
    const startedAtIso = new Date(startedAt).toISOString();
    let lastStatus: SessionStatus | null = null;
    let statusTimer: NodeJS.Timeout | null = null;

    const emitStatus = (status: SessionStatus, reason: string | null = null): void => {
      if (!opts.onStatus || opts.runId == null || !opts.featureId || !opts.tool) return;
      const now = Date.now();
      const terminal = status === 'interrupted' || status === 'failed' || status === 'timed_out' || status === 'completed';
      if (!terminal && status === lastStatus) return;
      lastStatus = status;
      const idleMs = status === 'idle' ? Math.max(0, now - lastOutputAt) : null;
      opts.onStatus({
        runId: opts.runId,
        featureId: opts.featureId,
        tool: opts.tool,
        status,
        startedAt: startedAtIso,
        updatedAt: new Date(now).toISOString(),
        elapsedMs: Math.max(0, now - startedAt),
        lastOutputAt: lastOutputAt === startedAt ? null : new Date(lastOutputAt).toISOString(),
        idleMs,
        reason: reason ? reason.slice(0, 500) : null,
        terminal,
      });
    };

    const statusTickMs = Math.max(50, Math.min(idleThresholdMs, 1_000));
    statusTimer = setInterval(() => {
      if (settled) return;
      if (Date.now() - lastOutputAt >= idleThresholdMs) emitStatus('idle');
    }, statusTickMs);

    emitStatus('running');
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      child.kill('SIGKILL');
      emitStatus('timed_out', `${bin} exceeded timeout after ${String(timeoutMs)}ms`);
      reject(new CliTimeoutError(bin, timeoutMs, Date.now() - startedAt, stdout, stderr));
    }, timeoutMs);

    const heartbeat = heartbeatMs > 0
      ? setInterval(() => {
          const elapsedMs = Date.now() - startedAt;
          const idleMs = Date.now() - lastOutputAt;
          const label = opts.logLabel ?? bin;
          const suffix = opts.heartbeatSuffix?.();
          opts.onHeartbeat?.(
            `[msq] ${label} running for ${String(Math.round(elapsedMs / 1000))}s `
              + `(stdout ${String(stdout.length)}B stderr ${String(stderr.length)}B idle ${String(Math.round(idleMs / 1000))}s)`
              + (suffix ? ` ${suffix}` : ''),
          );
        }, heartbeatMs)
      : null;

    const drainLines = (chunk: string, pending: string, sink?: (line: string) => void): string => {
      if (!sink) return pending + chunk;
      const text = pending + chunk;
      const lines = text.split('\n');
      const rest = lines.pop() ?? '';
      for (const line of lines) sink(line);
      return rest;
    };

    const cleanup = (): void => {
      clearTimeout(timer);
      if (heartbeat) clearInterval(heartbeat);
      clearInterval(statusTimer);
      if (killTimer) clearTimeout(killTimer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
    };

    const onAbort = (): void => {
      if (settled || abortRequested) return;
      abortRequested = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (settled) return;
        child.kill('SIGKILL');
      }, 2_000);
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
      } else {
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    child.stdout.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stdout += chunk;
      opts.onStdoutChunk?.(chunk);
      stdoutPending = drainLines(chunk, stdoutPending, opts.onStdoutLine);
      lastOutputAt = Date.now();
      emitStatus('running');
    });
    child.stderr.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stderr += chunk;
      opts.onStderrChunk?.(chunk);
      stderrPending = drainLines(chunk, stderrPending, opts.onStderrLine);
      lastOutputAt = Date.now();
      emitStatus('running');
    });
    child.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      emitStatus('failed', err.message);
      reject(err);
    });
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (stdoutPending) opts.onStdoutLine?.(stdoutPending);
      if (stderrPending) opts.onStderrLine?.(stderrPending);
      if (abortRequested) {
        emitStatus('interrupted', `${bin} aborted manually`);
        reject(new CliAbortError(bin, Date.now() - startedAt, stdout, stderr, signal));
        return;
      }
      if ((code ?? -1) === 0) emitStatus('completed');
      else emitStatus('failed', `${bin} exited with code ${String(code ?? -1)}`);
      resolve({ code: code ?? -1, stdout, stderr, signal });
    });
  });
}
