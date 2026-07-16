#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertNodeVersion } from './gate-lib.mjs';

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');

function main() {
  assertNodeVersion();

  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error('Usage: node scripts/with-sandbox-db.mjs <command> [args...]');
    process.exit(2);
  }

  const sandboxDir = join(repoRoot, '.metal-squad', 'harness', randomUUID());
  const dbPath = join(sandboxDir, 'app.db');
  mkdirSync(sandboxDir, { recursive: true });

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, MSQ_DB_PATH: dbPath },
  });

  const status = result.status ?? 1;
  if (status === 0 && !process.env.MSQ_SANDBOX_KEEP) {
    rmSync(sandboxDir, { recursive: true, force: true });
  } else if (status !== 0) {
    console.error(`[with-sandbox-db] command failed (exit ${status}); sandbox preserved at ${sandboxDir}`);
  } else {
    console.log(`[with-sandbox-db] MSQ_SANDBOX_KEEP set; sandbox preserved at ${sandboxDir}`);
  }

  process.exit(status);
}

main();
