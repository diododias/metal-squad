import type { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getOrCreateWebToken, resolveWebConfig } from '../web/token.js';
import { logCaughtError } from '../core/events/logging.js';

const PID_PATH = join(homedir(), '.local', 'share', 'metal-squad', 'daemon.pid');

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(): number | null {
  if (!existsSync(PID_PATH)) return null;
  try {
    const pid = Number(readFileSync(PID_PATH, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (error) {
    logCaughtError('commands/daemon.readPid', error);
    return null;
  }
}

function writePid(pid: number): void {
  writeFileSync(PID_PATH, String(pid));
}

function removePid(): void {
  try {
    unlinkSync(PID_PATH);
  } catch (error) {
    logCaughtError('commands/daemon.removePid', error);
  }
}

async function startDaemon(opts: { host?: string; port?: string; auth?: boolean }): Promise<void> {
  const config = resolveWebConfig({
    host: opts.host,
    port: opts.port !== undefined ? Number(opts.port) : undefined,
    auth: opts.auth === false ? 'none' : 'token',
  });

  const existingPid = readPid();
  if (existingPid && isProcessAlive(existingPid)) {
    console.log(`Daemon already running (PID ${String(existingPid)}) at ${config.host}:${String(config.port)}`);
    return;
  }

  const token = config.auth === 'token' ? await getOrCreateWebToken() : '';
  const args = ['web', '--host', config.host, '--port', String(config.port)];
  if (config.auth === 'none') args.push('--no-auth');

  const child = spawn(process.execPath, [process.argv[1] ?? 'msq', ...args], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      MSQ_WEB_TOKEN: token,
    },
  });

  child.once('error', (error) => {
    throw new Error(`Failed to start daemon: ${error.message}`);
  });

  const pid = child.pid;
  if (!pid) {
    throw new Error('Failed to start daemon: child process had no PID');
  }

  writePid(pid);
  child.unref();

  console.log(`Daemon started (PID ${String(pid)}) at http://${config.host}:${String(config.port)}`);
  if (config.auth === 'token') {
    console.log(`Access URL: http://${config.host}:${String(config.port)}?token=${token}`);
  }
}

function stopDaemon(): void {
  const pid = readPid();
  if (!pid) {
    console.log('No daemon PID file found.');
    return;
  }

  if (!isProcessAlive(pid)) {
    removePid();
    console.log(`Daemon PID ${String(pid)} was not running; removed stale PID file.`);
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Daemon stopped (PID ${String(pid)}).`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to stop daemon: ${message}`);
  } finally {
    removePid();
  }
}

function daemonStatus(): void {
  const config = resolveWebConfig();
  const pid = readPid();
  if (!pid) {
    console.log(`Daemon: not running (configured for ${config.host}:${String(config.port)})`);
    return;
  }

  if (isProcessAlive(pid)) {
    console.log(`Daemon: running at ${config.host}:${String(config.port)} (PID ${String(pid)})`);
  } else {
    removePid();
    console.log(`Daemon: not running (removed stale PID ${String(pid)})`);
  }
}

async function restartDaemon(opts: { host?: string; port?: string; auth?: boolean }): Promise<void> {
  stopDaemon();
  await startDaemon(opts);
}

export function registerDaemon(program: Command): void {
  const daemon = program.command('daemon').description('Manage the msq web daemon');

  daemon
    .command('start')
    .description('Start the msq web daemon in the background')
    .option('--host <host>', 'bind address')
    .option('--port <port>', 'port number')
    .option('--no-auth', 'disable token authentication')
    .action(startDaemon);

  daemon.command('stop').description('Stop the msq web daemon').action(stopDaemon);

  daemon.command('status').description('Show daemon status').action(daemonStatus);

  daemon
    .command('restart')
    .description('Restart the msq web daemon')
    .option('--host <host>', 'bind address')
    .option('--port <port>', 'port number')
    .option('--no-auth', 'disable token authentication')
    .action(restartDaemon);
}
