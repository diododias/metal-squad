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
