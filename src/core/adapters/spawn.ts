import { spawn } from 'node:child_process';

export interface SpawnResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SpawnOptions {
  cwd: string;
  timeoutMs?: number; // default 10min
  env?: NodeJS.ProcessEnv;
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
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${bin} excedeu timeout (${opts.timeoutMs ?? 600000}ms)`));
    }, opts.timeoutMs ?? 600_000);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}
