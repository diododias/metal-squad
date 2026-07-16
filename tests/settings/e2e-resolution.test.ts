import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigSchema, mergeExecutionDefaults } from '../../src/config/index.js';
import { BacklogV2Schema, WorkflowSchema } from '../../src/core/backlog/schema.js';

describe('settings end-to-end resolution (SET-44)', () => {
  const previousDbPath = process.env.MSQ_DB_PATH;
  const paths: string[] = [];

  afterEach(() => {
    paths.forEach((path) => rmSync(path, { recursive: true, force: true }));
    paths.length = 0;
    if (previousDbPath === undefined) delete process.env.MSQ_DB_PATH;
    else process.env.MSQ_DB_PATH = previousDbPath;
  });

  it('resolves project defaults and feature overrides with registered tools, adapter thinking, and unified autoAdvance', async () => {
    const app = ConfigSchema.parse({ tools: [{ id: 'codex-custom', adapter: 'codex', command: 'codex', baseArgs: [], env: {}, versionCheck: ['--version'], capabilities: { model: true, effort: true, thinking: false }, thinkingBudget: { low: 0, medium: 0, high: 0 }, minTimeoutMs: 1_800_000 }] });
    expect(app.tools.find((tool) => tool.id === 'codex-custom')).toMatchObject({ adapter: 'codex', capabilities: { thinking: false } });

    const cwd = mkdtempSync(join(tmpdir(), 'msq-settings-e2e-'));
    paths.push(cwd);
    process.env.MSQ_DB_PATH = join(cwd, 'app.db');
    writeFileSync(join(cwd, 'backlog.yaml'), `version: 2
repo: settings-e2e
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

    const { resolveRepo } = await import('../../src/core/repo.js');
    const { registerRepo } = await import('../../src/db/repo.js');
    const { upsertBacklogCatalog, updateCatalogDefaults } = await import('../../src/db/backlogCatalog.js');
    const { loadBacklogWithRegistration, loadBacklogFromCatalog } = await import('../../src/core/backlog/load.js');

    const { repoId, path } = resolveRepo(cwd);
    registerRepo(repoId, path);

    // Bootstraps an empty catalog entry so `updateCatalogDefaults` (an UPDATE,
    // not an upsert) has a row to act on, then sets the real project defaults
    // *before* publishing features — project defaults are owned by the
    // Projeto (catalogo SQLite); backlog.yaml `defaults` are ignored by design
    // (see load.ts's `applyProjectDefaults`/`projectSettings`). Publishing
    // after the defaults are set lets `loadBacklogWithRegistration` resolve
    // each feature against the real defaults, so a feature's explicit
    // override is distinguishable from an inherited value even when it
    // happens to equal the schema's base default (e.g. tool: claude).
    upsertBacklogCatalog(BacklogV2Schema.parse({ version: 2, repo: 'settings-e2e', epics: [] }), repoId);
    updateCatalogDefaults(repoId, {
      tool: 'codex',
      model: 'gpt-5.6',
      effort: 'high',
      thinking: 'on',
      workflow: { stages: ['implement'], autoAdvance: true },
    });

    const loaded = loadBacklogWithRegistration(join(cwd, 'backlog.yaml'), cwd);
    upsertBacklogCatalog(loaded.backlog, repoId, loaded.registrations);

    const project = loadBacklogFromCatalog(repoId, cwd);

    const inherited = mergeExecutionDefaults(project.defaults, project.epics[0]!.features[0]!);
    const overridden = mergeExecutionDefaults(project.defaults, project.epics[0]!.features[1]!);
    expect(inherited).toMatchObject({ tool: 'codex', model: 'gpt-5.6', effort: 'high', thinking: 'on' });
    expect(overridden).toMatchObject({ tool: 'claude', model: 'sonnet', effort: 'low', thinking: 'off' });
    expect(project.epics[0]!.features[0]!.workflow.autoAdvance).toBe(true);
    expect(project.epics[0]!.features[1]!.workflow.autoAdvance).toBe(false);
    expect(WorkflowSchema.parse({ approvals: { autoAdvance: true } }).autoAdvance).toBe(true);
  });
});
