import { spawn } from 'node:child_process';

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
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      child.kill('SIGKILL');
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
    });
    child.stderr.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stderr += chunk;
      opts.onStderrChunk?.(chunk);
      stderrPending = drainLines(chunk, stderrPending, opts.onStderrLine);
      lastOutputAt = Date.now();
    });
    child.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (stdoutPending) opts.onStdoutLine?.(stdoutPending);
      if (stderrPending) opts.onStderrLine?.(stderrPending);
      if (abortRequested) {
        reject(new CliAbortError(bin, Date.now() - startedAt, stdout, stderr, signal));
        return;
      }
      resolve({ code: code ?? -1, stdout, stderr, signal });
    });
  });
}
