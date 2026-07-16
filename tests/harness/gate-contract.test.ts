import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoFile = (path: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8');

describe('harness gate contract', () => {
  const pkg = JSON.parse(repoFile('package.json')) as { scripts: Record<string, string> };

  it('build is pure: it never runs the db migration', () => {
    expect(pkg.scripts['build']).not.toContain('migrate-db');
    expect(pkg.scripts['build']).not.toContain('migrate:db');
  });

  it('migrate:db stays available as an explicit command', () => {
    expect(pkg.scripts['migrate:db']).toBe('node scripts/migrate-db.mjs');
  });

  it('gate:full always runs inside the sandbox db wrapper', () => {
    expect(pkg.scripts['gate:full']).toContain('scripts/with-sandbox-db.mjs');
    expect(pkg.scripts['gate:full']).toContain('scripts/gate.mjs full');
  });

  it('gate:fast runs the gate without any db wrapper', () => {
    expect(pkg.scripts['gate:fast']).toBe('node scripts/gate.mjs fast');
  });

  it('web migrates the real db explicitly before starting', () => {
    expect(pkg.scripts['web']).toContain('npm run migrate:db');
  });

  it('pre-commit hook runs the fast gate', () => {
    expect(repoFile('.husky/pre-commit')).toContain('scripts/gate.mjs fast');
  });

  it('pre-push hook runs the full gate inside the sandbox db wrapper', () => {
    const prePush = repoFile('.husky/pre-push');
    expect(prePush).toContain('scripts/with-sandbox-db.mjs');
    expect(prePush).toContain('scripts/gate.mjs full');
  });

  it('gate full mode refuses to run without a sandbox MSQ_DB_PATH', () => {
    expect(repoFile('scripts/gate.mjs')).toContain('full mode requires a sandbox MSQ_DB_PATH');
  });
});
