import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';

describe('backlog task sync', () => {
  let cwd = '';

  afterEach(() => {
    if (cwd) rmSync(cwd, { recursive: true, force: true });
    cwd = '';
  });

  it('imports tasks from tasks.md into backlog.yaml for the matching feature', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-sync-'));
    writeFileSync(join(cwd, 'backlog.yaml'), `version: 2
repo: demo
defaults:
  tool: codex
  effort: medium
  skills: []
epics:
  - id: epic-1
    title: Epic
    features:
      - id: feat-1
        title: Feature
        tool: codex
        effort: medium
        dependsOn: []
        tasks: []
`);
    writeFileSync(
      join(cwd, 'tasks.md'),
      [
        '# Tasks',
        '- [ ] T001 Preparar ambiente',
        '- [x] T002 Validar contrato',
      ].join('\n'),
    );

    const { syncFeatureTasksToBacklog } = await import('../../src/core/backlog/sync.js');
    const synced = syncFeatureTasksToBacklog('feat-1', 'tasks.md', cwd);

    expect(synced).toBe(2);
    const updated = parse(readFileSync(join(cwd, 'backlog.yaml'), 'utf8')) as {
      epics: Array<{ features: Array<{ tasks: Array<{ id: string; title: string; status: string }> }> }>;
    };
    expect(updated.epics[0]?.features[0]?.tasks).toEqual([
      { id: 'T001', title: 'Preparar ambiente', status: 'todo', dependsOn: [] },
      { id: 'T002', title: 'Validar contrato', status: 'done', dependsOn: [] },
    ]);
  });
});
