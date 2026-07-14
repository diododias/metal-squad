import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { CANONICAL_FEATURE_ID_RE } from '../../src/core/backlog/featureId.js';
import { loadBacklog, stageBacklogFile } from '../../src/core/backlog/load.js';

describe('backlog feature registration', () => {
  const previousDbPath = process.env['MSQ_DB_PATH'];
  let root = '';

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = '';
    if (previousDbPath === undefined) delete process.env['MSQ_DB_PATH'];
    else process.env['MSQ_DB_PATH'] = previousDbPath;
  });

  function setup(): string {
    root = mkdtempSync(join(tmpdir(), 'msq-feature-id-'));
    process.env['MSQ_DB_PATH'] = join(root, 'catalog.db');
    const path = join(root, 'backlog.yaml');
    writeFileSync(path, [
      'version: 2',
      'repo: demo',
      'defaults:',
      '  tool: claude',
      '  effort: medium',
      '  skills: []',
      '  stageSkills: {}',
      'epics:',
      '  - id: epic-1',
      '    title: Epic',
      '    features:',
      '      - title: Generated feature',
      '        dependsOn: []',
      '        tasks: []',
      '        customValue: keep-me',
    ].join('\n'), 'utf8');
    return path;
  }

  it('assigns a generated ID and consumes the feature from YAML', () => {
    const path = setup();
    const first = loadBacklog(path, root);
    const id = first.epics[0]?.features[0]?.id;
    expect(id).toMatch(CANONICAL_FEATURE_ID_RE);

    const staged = stageBacklogFile(path, root, first);
    staged.commit();
    const materialized = parse(readFileSync(path, 'utf8')) as { epics: Array<{ features: Array<{ id?: string; customValue?: string }> }> };
    expect(materialized.epics[0]?.features).toEqual([]);

    const second = loadBacklog(path, root);
    expect(second.epics[0]?.features).toEqual([]);
    expect(stageBacklogFile(path, root, second)).toBeDefined();
  });

  it('restores the original YAML when staged publication is rolled back', () => {
    const path = setup();
    const original = readFileSync(path, 'utf8');
    const backlog = loadBacklog(path, root);
    const staged = stageBacklogFile(path, root, backlog);
    expect(readFileSync(path, 'utf8')).not.toBe(original);
    staged.rollback();
    expect(readFileSync(path, 'utf8')).toBe(original);
  });

  it('ignores an ID supplied by the YAML source', () => {
    const path = setup();
    writeFileSync(path, [
      'version: 2',
      'repo: demo',
      'defaults:',
      '  tool: claude',
      '  effort: medium',
      '  skills: []',
      '  stageSkills: {}',
      'epics:',
      '  - id: epic-1',
      '    title: Epic',
      '    features:',
      '      - id: feat-legacy',
      '        title: Source ID is ignored',
      '        dependsOn: []',
      '        tasks: []',
    ].join('\n'), 'utf8');

    const second = loadBacklog(path, root);
    expect(second.epics[0]?.features[0]?.id).toMatch(CANONICAL_FEATURE_ID_RE);
    expect(second.epics[0]?.features[0]?.id).not.toBe('feat-legacy');
  });
});
