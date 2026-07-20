import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('loadBacklog — project defaults', () => {
  let cwd = '';

  afterEach(() => {
    vi.restoreAllMocks();
    if (cwd) rmSync(cwd, { recursive: true, force: true });
    cwd = '';
  });

  it('loads an asset without a defaults block', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-backlog-'));
    writeFileSync(join(cwd, 'backlog.yaml'), `version: 2
repo: demo
epics:
  - id: epic-1
    title: Epic
    features:
      - id: feat-1
        title: Feature
`);

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const backlog = loadBacklog(undefined, cwd);

    expect(backlog.defaults).toMatchObject({ tool: 'claude', effort: 'medium', skills: [] });
    expect(backlog.epics[0]?.features[0]).toMatchObject({ tool: 'claude', effort: 'medium', skills: [] });
  });

  it('does not let .msq/config.yaml override execution defaults', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-backlog-'));
    writeFileSync(join(cwd, 'backlog.yaml'), `version: 2
repo: demo
epics: []
`);
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(cwd, '.msq'));
    writeFileSync(join(cwd, '.msq', 'config.yaml'), 'defaults:\n  tool: codex\n  effort: high\n');

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const backlog = loadBacklog(undefined, cwd);

    expect(backlog.defaults).toMatchObject({ tool: 'claude', effort: 'medium' });
  });
});

describe('loadBacklog — Work Item type (PRJ-22)', () => {
  let cwd = '';

  afterEach(() => {
    vi.restoreAllMocks();
    if (cwd) rmSync(cwd, { recursive: true, force: true });
    cwd = '';
  });

  it('defaults a v2 Work Item without a type to "feature"', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-backlog-'));
    writeFileSync(join(cwd, 'backlog.yaml'), `version: 2
repo: demo
epics:
  - id: epic-1
    title: Epic
    features:
      - id: feat-1
        title: Feature
`);

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const backlog = loadBacklog(undefined, cwd);

    expect(backlog.epics[0]?.features[0]?.type).toBe('feature');
  });

  it('defaults a legacy v1 Work Item without a type to "feature"', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-backlog-'));
    writeFileSync(join(cwd, 'backlog.yaml'), `version: 1
repo: demo
epics:
  - id: epic-1
    title: Epic
    features:
      - id: feat-1
        title: Feature
`);

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const backlog = loadBacklog(undefined, cwd);

    expect(backlog.epics[0]?.features[0]?.type).toBe('feature');
  });

  it('preserves an explicit "bug" type declared in the YAML', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-backlog-'));
    writeFileSync(join(cwd, 'backlog.yaml'), `version: 2
repo: demo
epics:
  - id: epic-1
    title: Epic
    features:
      - id: feat-1
        title: Feature
        type: bug
`);

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const backlog = loadBacklog(undefined, cwd);

    expect(backlog.epics[0]?.features[0]?.type).toBe('bug');
  });

  it('rejects an unsupported type value instead of treating it as free text', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-backlog-'));
    writeFileSync(join(cwd, 'backlog.yaml'), `version: 2
repo: demo
epics:
  - id: epic-1
    title: Epic
    features:
      - id: feat-1
        title: Feature
        type: hotfix
`);

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    expect(() => loadBacklog(undefined, cwd)).toThrow();
  });
});
