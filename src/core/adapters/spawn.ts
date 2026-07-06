import { spawn } from 'node:child_process';

export interface SpawnResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class CliTimeoutError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly timeoutMs: number;
  readonly runtimeMs: number;

  constructor(
    bin: string,
    timeoutMs: number,
    runtimeMs: number,
    stdout: string,
    stderr: string,
  ) {
    super(`${bin} excedeu timeout (${timeoutMs}ms)`);
    this.name = 'CliTimeoutError';
    this.stdout = stdout;
    this.stderr = stderr;
    this.timeoutMs = timeoutMs;
    this.runtimeMs = runtimeMs;
  }
}

export interface SpawnOptions {
  cwd: string;
  timeoutMs?: number; // default 10min
  env?: NodeJS.ProcessEnv;
  heartbeatMs?: number;
  logLabel?: string;
  heartbeatSuffix?: () => string | undefined;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
}

/** Executa um CLI de forma não-interativa e captura stdout/stderr. */
export function runCli(
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
    const heartbeatMs = opts.heartbeatMs ?? 0;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new CliTimeoutError(bin, timeoutMs, Date.now() - startedAt, stdout, stderr));
    }, timeoutMs);

    const heartbeat = heartbeatMs > 0
      ? setInterval(() => {
          const elapsedMs = Date.now() - startedAt;
          const idleMs = Date.now() - lastOutputAt;
          const label = opts.logLabel ?? bin;
          const suffix = opts.heartbeatSuffix?.();
          console.log(
            `[msq] ${label} em execução há ${Math.round(elapsedMs / 1000)}s `
              + `(stdout=${stdout.length}B stderr=${stderr.length}B idle=${Math.round(idleMs / 1000)}s)`
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

    child.stdout.on('data', (d) => {
      const chunk = d.toString();
      stdout += chunk;
      stdoutPending = drainLines(chunk, stdoutPending, opts.onStdoutLine);
      lastOutputAt = Date.now();
    });
    child.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      stderrPending = drainLines(chunk, stderrPending, opts.onStderrLine);
      lastOutputAt = Date.now();
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (heartbeat) clearInterval(heartbeat);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (heartbeat) clearInterval(heartbeat);
      if (stdoutPending) opts.onStdoutLine?.(stdoutPending);
      if (stderrPending) opts.onStderrLine?.(stderrPending);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}
