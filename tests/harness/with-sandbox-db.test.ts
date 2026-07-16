import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/with-sandbox-db.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function runSandboxed(childCode: string) {
  const result = spawnSync(process.execPath, [script, process.execPath, '-e', childCode], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const dbPath = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('app.db'))
    .pop();
  return { result, dbPath };
}

describe('with-sandbox-db', () => {
  it('exposes a sandbox MSQ_DB_PATH inside the workspace and cleans up on success', () => {
    const { result, dbPath } = runSandboxed('console.log(process.env.MSQ_DB_PATH)');

    expect(result.status).toBe(0);
    expect(dbPath).toBeDefined();
    expect(dbPath).toContain(join('.metal-squad', 'harness') + sep);
    expect(dbPath!.startsWith(repoRoot)).toBe(true);
    expect(existsSync(dirname(dbPath!))).toBe(false);
  });

  it('propagates the exit code and preserves the sandbox on failure', () => {
    const { result, dbPath } = runSandboxed('console.log(process.env.MSQ_DB_PATH); process.exit(3)');

    expect(result.status).toBe(3);
    expect(result.stderr).toContain('sandbox preserved at');
    expect(dbPath).toBeDefined();
    const sandboxDir = dirname(dbPath!);
    expect(existsSync(sandboxDir)).toBe(true);
    rmSync(sandboxDir, { recursive: true, force: true });
  });

  it('fails with usage when no command is given', () => {
    const result = spawnSync(process.execPath, [script], { cwd: repoRoot, encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Usage:');
  });
});
