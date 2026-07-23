#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertNodeVersion, resolveFastTestArgs } from './gate-lib.mjs';

const mode = process.argv[2] ?? 'fast';
const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
// `--absolute-git-dir` resolves to the worktree's own git dir (e.g.
// `.git/worktrees/<name>`) instead of assuming `<repoRoot>/.git` is a
// directory, which is false inside a `git worktree` checkout (there it's a
// file pointing at the real git dir). node_modules is per-worktree, so the
// stamp must be too.
const gitDir = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: repoRoot, encoding: 'utf8' })
  .stdout.trim() || join(repoRoot, '.git');
const stampPath = join(gitDir, '.msq-npm-ci-stamp');

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
    /The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set\./i,
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

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`Command failed: ${[command, ...args].join(' ')}`);
  }
  return result.stdout ?? '';
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
    console.log('[gate] npm ci skipped (lockfile/node version unchanged)');
    return;
  }

  run('npm', ['ci']);
  mkdirSync(dirname(stampPath), { recursive: true });
  writeFileSync(stampPath, `${digest}\n`);
}

function runFastTests() {
  const stagedFiles = capture('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const testArgs = resolveFastTestArgs(stagedFiles);
  if (!testArgs) {
    console.log('[gate] no staged src/tests changes; skipping tests');
    return;
  }

  run('npx', ['vitest', ...testArgs]);
}

function runFast() {
  run('npm', ['run', 'typecheck']);
  run('npm', ['run', 'lint']);
  runFastTests();
}

function runFull() {
  if (!process.env.MSQ_DB_PATH) {
    throw new Error(
      '[gate] full mode requires a sandbox MSQ_DB_PATH so it never touches the real catalog. Run it via `npm run gate:full`.',
    );
  }

  run('npm', ['run', 'build']);
  run('npm', ['run', 'migrate:db']);
  run('npm', ['run', 'typecheck']);
  run('npm', ['run', 'lint']);
  run('npm', ['test']);
  run('npm', ['run', 'test:coverage:gate']);
  run('npm', ['run', 'verify:repo']);
  run('node', ['dist/index.js', '--help']);
}

function main() {
  if (mode !== 'fast' && mode !== 'full') {
    throw new Error(`[gate] unknown mode "${mode}"; expected "fast" or "full"`);
  }

  assertNodeVersion();
  console.log(`[gate] starting ${mode}`);
  ensureDependenciesInstalled();

  if (mode === 'fast') runFast();
  else runFull();

  console.log(`[gate] ${mode} passed`);
}

main();
