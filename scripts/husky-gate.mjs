#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2] ?? 'pre-commit';
const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const stampPath = join(repoRoot, '.git', '.msq-npm-ci-stamp');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    ...options,
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  const combined = `${stdout}\n${stderr}`;
  const warnings = combined
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\bwarning\b/i.test(line));
  const allowedWarnings = [
    /MaxListenersExceededWarning/i,
    /Use emitter\.setMaxListeners\(\) to increase limit/i,
    /\(Use `node --trace-warnings/i,
  ];
  const unexpectedWarnings = warnings.filter(
    (line) => !allowedWarnings.some((pattern) => pattern.test(line)),
  );

  if (unexpectedWarnings.length > 0) {
    throw new Error(`Unexpected warning output while running: ${[command, ...args].join(' ')}`);
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${[command, ...args].join(' ')}`);
  }
}

function ensureDependenciesInstalled() {
  const packageJson = readFileSync(join(repoRoot, 'package.json'), 'utf8');
  const packageLock = readFileSync(join(repoRoot, 'package-lock.json'), 'utf8');
  const digest = createHash('sha256')
    .update(process.version)
    .update(packageJson)
    .update(packageLock)
    .digest('hex');

  const currentStamp = existsSync(stampPath) ? readFileSync(stampPath, 'utf8').trim() : '';
  if (existsSync(join(repoRoot, 'node_modules')) && currentStamp === digest) {
    console.log('[husky-gate] npm ci skipped (lockfile/node version unchanged)');
    return;
  }

  run('rtk', ['npm', 'ci']);
  mkdirSync(dirname(stampPath), { recursive: true });
  writeFileSync(stampPath, `${digest}\n`);
}

function main() {
  console.log(`[husky-gate] starting ${mode}`);
  ensureDependenciesInstalled();

  run('rtk', ['npm', 'run', 'build']);
  run('rtk', ['npm', 'run', 'typecheck']);
  run('rtk', ['npm', 'run', 'lint']);
  run('rtk', ['npm', 'test']);
  run('rtk', ['npm', 'run', 'test:coverage:gate']);
  run('rtk', ['npm', 'run', 'verify:repo']);
  run('rtk', ['node', 'dist/index.js', '--help']);

  console.log(`[husky-gate] ${mode} passed`);
}

main();
