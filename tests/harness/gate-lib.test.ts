import { describe, expect, it } from 'vitest';
import { isNodeVersionSupported, resolveFastTestArgs } from '../../scripts/gate-lib.mjs';

describe('isNodeVersionSupported', () => {
  it('accepts versions at or above the minimum', () => {
    expect(isNodeVersionSupported('20.17.0')).toBe(true);
    expect(isNodeVersionSupported('20.18.1')).toBe(true);
    expect(isNodeVersionSupported('22.0.0')).toBe(true);
    expect(isNodeVersionSupported('v21.0.0')).toBe(true);
  });

  it('rejects versions below the minimum', () => {
    expect(isNodeVersionSupported('20.16.9')).toBe(false);
    expect(isNodeVersionSupported('18.20.0')).toBe(false);
  });
});

describe('resolveFastTestArgs', () => {
  it('returns null when nothing under src/ or tests/ is staged', () => {
    expect(resolveFastTestArgs([])).toBeNull();
    expect(resolveFastTestArgs(['docs/features/F60.md', '.claude/rules/testing.md', 'README.md'])).toBeNull();
  });

  it('runs staged test files directly when only tests changed', () => {
    expect(resolveFastTestArgs(['tests/db/repo.test.ts', 'tests/ui/render.test.tsx'])).toEqual([
      'run',
      'tests/db/repo.test.ts',
      'tests/ui/render.test.tsx',
    ]);
  });

  it('uses vitest related when src files are staged', () => {
    expect(resolveFastTestArgs(['src/config/index.ts', 'docs/x.md'])).toEqual([
      'related',
      '--run',
      'src/config/index.ts',
    ]);
  });

  it('mixes src and test files through vitest related', () => {
    expect(resolveFastTestArgs(['src/db/index.ts', 'tests/db/index.test.ts'])).toEqual([
      'related',
      '--run',
      'src/db/index.ts',
      'tests/db/index.test.ts',
    ]);
  });

  it('treats non-test helpers under tests/ as related inputs', () => {
    expect(resolveFastTestArgs(['tests/fixtures/helper.ts'])).toEqual([
      'related',
      '--run',
      'tests/fixtures/helper.ts',
    ]);
  });

  it('ignores non-code staged files inside src/', () => {
    expect(resolveFastTestArgs(['src/web/static/style.css'])).toBeNull();
  });
});
