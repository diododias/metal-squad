import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigSchema, mergeExecutionDefaults } from '../../src/config/index.js';
import { WorkflowSchema } from '../../src/core/backlog/schema.js';
import { loadBacklog } from '../../src/core/backlog/load.js';

describe('settings end-to-end resolution (SET-44)', () => {
  const previousDbPath = process.env.MSQ_DB_PATH;
  const paths: string[] = [];

  afterEach(() => {
    paths.forEach((path) => rmSync(path, { recursive: true, force: true }));
    paths.length = 0;
    if (previousDbPath === undefined) delete process.env.MSQ_DB_PATH;
    else process.env.MSQ_DB_PATH = previousDbPath;
  });

  it('resolves project defaults and feature overrides with registered tools, adapter thinking, and unified autoAdvance', () => {
    const app = ConfigSchema.parse({ tools: [{ id: 'codex-custom', adapter: 'codex', command: 'codex', baseArgs: [], env: {}, versionCheck: ['--version'], capabilities: { model: true, effort: true, thinking: false }, thinkingBudget: { low: 0, medium: 0, high: 0 }, minTimeoutMs: 1_800_000 }] });
    const cwd = mkdtempSync(join(tmpdir(), 'msq-settings-e2e-'));
    paths.push(cwd);
    process.env.MSQ_DB_PATH = join(cwd, 'app.db');
    writeFileSync(join(cwd, 'backlog.yaml'), `version: 2
repo: settings-e2e
defaults:
  tool: codex
  model: gpt-5.6
  effort: high
  thinking: on
  workflow:
    stages: [implement]
    autoAdvance: true
epics:
  - id: settings
    title: Settings
    features:
      - id: inherits
        title: Inherits
      - id: overrides
        title: Overrides
        tool: claude
        model: sonnet
        effort: low
        thinking: off
        workflow:
          stages: [implement]
          autoAdvance: false
`);
    const project = loadBacklog(join(cwd, 'backlog.yaml'), cwd);
    expect(app.tools.find((tool) => tool.id === 'codex-custom')).toMatchObject({ adapter: 'codex', capabilities: { thinking: false } });

    const inherited = mergeExecutionDefaults(project.defaults, project.epics[0]!.features[0]!);
    const overridden = mergeExecutionDefaults(project.defaults, project.epics[0]!.features[1]!);
    expect(inherited).toMatchObject({ tool: 'codex', model: 'gpt-5.6', effort: 'high', thinking: 'on' });
    expect(overridden).toMatchObject({ tool: 'claude', model: 'sonnet', effort: 'low', thinking: 'off' });
    expect(project.epics[0]!.features[0]!.workflow.autoAdvance).toBe(true);
    expect(project.epics[0]!.features[1]!.workflow.autoAdvance).toBe(false);
    expect(WorkflowSchema.parse({ approvals: { autoAdvance: true } }).autoAdvance).toBe(true);
  });
});
