import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Work Item template snapshot at creation (PRJ-24)', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-work-item-snapshot-'));
    process.env['MSQ_DB_PATH'] = join(directory, 'app.db');
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) delete process.env['MSQ_DB_PATH'];
    else process.env['MSQ_DB_PATH'] = previousDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  async function setup() {
    const dbModule = await import('../../src/db/index.js');
    resetDb = dbModule.resetDb;
    const templates = await import('../../src/db/workflowTemplates.js');
    const repo = await import('../../src/db/repo.js');
    const errors = await import('../../src/db/errors.js');
    const stageSkills = await import('../../src/core/workflow/stageSkills.js');
    return { db: dbModule.getDb('readwrite'), ...templates, ...repo, ...errors, ...stageSkills };
  }

  /** Project + linked repo + Epic, the minimum chain a Work Item needs. */
  async function seedProjectChain(name: string) {
    const context = await setup();
    const { backfillProjects } = await import('../../src/db/backfill.js');
    backfillProjects(context.db);
    const repoPath = join(directory, `repo-${name}`);
    mkdirSync(repoPath, { recursive: true });
    const project = context.createProject({ name });
    context.registerRepo('repo-a', repoPath);
    context.linkRepo(project.projectId, 'repo-a');
    const epic = context.createEpic({ projectId: project.projectId, title: `${name} epic` });
    return { ...context, project, epic, repoPath };
  }

  /** Reads back the persisted `data_json` — the snapshot's source of truth. */
  function readData(db: ReturnType<typeof Object>, workItemId: string): Record<string, unknown> {
    const row = (db as { prepare: (sql: string) => { get: (id: string) => { dataJson: string } | undefined } })
      .prepare(`SELECT data_json AS dataJson FROM backlog_features WHERE feature_id = ?`)
      .get(workItemId);
    if (!row) throw new Error(`Work Item not found: ${workItemId}`);
    return JSON.parse(row.dataJson) as Record<string, unknown>;
  }

  it('materializes distinct builtin snapshots for feature and bug Work Items', async () => {
    const context = await seedProjectChain('Snapshots');
    const { db, epic, project, createWorkItem, resolveTemplate } = context;

    const featureTemplate = resolveTemplate(project.projectId, 'feature');
    const bugTemplate = resolveTemplate(project.projectId, 'bug');

    const feature = createWorkItem(
      { epicId: epic.epicId, repoId: 'repo-a', title: 'A feature', type: 'feature' },
      {
        templateId: featureTemplate.templateId,
        templateVersion: featureTemplate.version,
        origin: featureTemplate.origin,
        definition: featureTemplate.definition,
      },
    );
    const bug = createWorkItem(
      { epicId: epic.epicId, repoId: 'repo-a', title: 'A bug', type: 'bug' },
      {
        templateId: bugTemplate.templateId,
        templateVersion: bugTemplate.version,
        origin: bugTemplate.origin,
        definition: bugTemplate.definition,
      },
    );

    const featureData = readData(db, feature.workItemId);
    const bugData = readData(db, bug.workItemId);

    expect(featureData['type']).toBe('feature');
    expect(bugData['type']).toBe('bug');
    expect(featureData['templateId']).toBe(context.BUILTIN_FEATURE_TEMPLATE_ID);
    expect(bugData['templateId']).toBe(context.BUILTIN_BUG_TEMPLATE_ID);
    expect(featureData['templateOrigin']).toBe('builtin');

    // The two builtins must not collapse into the same workflow.
    expect(bugData['workflow']).not.toEqual(featureData['workflow']);
    expect((bugData['workflow'] as { stages: string[] }).stages).toEqual([...context.BUG_STAGE_ORDER]);
    expect(bugData['stageSkills']).toEqual(bugTemplate.definition.stageSkills);
  });

  it('keeps an existing snapshot byte for byte when the template is updated afterwards', async () => {
    const context = await seedProjectChain('Immutable');
    const {
      db, epic, project, createWorkItem, createWorkflowTemplate,
      mapProjectWorkItemTemplate, updateWorkflowTemplate, resolveTemplate,
    } = context;

    const template = createWorkflowTemplate({
      projectId: project.projectId,
      name: 'Custom feature flow',
      definition: { workflow: { stages: ['plan', 'build'] }, stageSkills: { plan: [], build: [] } },
    });
    mapProjectWorkItemTemplate({
      projectId: project.projectId,
      workItemType: 'feature',
      templateId: template.templateId,
    });

    const resolved = resolveTemplate(project.projectId, 'feature');
    expect(resolved.origin).toBe('project-mapping');
    const created = createWorkItem(
      { epicId: epic.epicId, repoId: 'repo-a', title: 'Pinned item', type: 'feature' },
      {
        templateId: resolved.templateId,
        templateVersion: resolved.version,
        origin: resolved.origin,
        definition: resolved.definition,
      },
    );
    const before = readData(db, created.workItemId);
    expect(before['templateVersion']).toBe(1);

    const updated = updateWorkflowTemplate(
      template.templateId,
      { definition: { workflow: { stages: ['plan', 'build', 'verify'] }, stageSkills: { plan: [], build: [], verify: [] } } },
      template.revision,
    );
    expect(updated.version).toBe(2);

    // Version moved on the template, but the materialized snapshot did not.
    expect(readData(db, created.workItemId)).toEqual(before);
    expect((before['workflow'] as { stages: string[] }).stages).toEqual(['plan', 'build']);
    expect(before['templateVersion']).toBe(1);

    // Only creations after the update inherit the new definition.
    const next = resolveTemplate(project.projectId, 'feature');
    const later = createWorkItem(
      { epicId: epic.epicId, repoId: 'repo-a', title: 'Later item', type: 'feature' },
      {
        templateId: next.templateId,
        templateVersion: next.version,
        origin: next.origin,
        definition: next.definition,
      },
    );
    const laterData = readData(db, later.workItemId);
    expect(laterData['templateVersion']).toBe(2);
    expect((laterData['workflow'] as { stages: string[] }).stages).toEqual(['plan', 'build', 'verify']);
  });

  it('rejects a template whose skills are missing from the target repo before creating anything', async () => {
    const context = await seedProjectChain('Validation');
    const { db, project, createWorkflowTemplate, resolveTemplate, mapProjectWorkItemTemplate, repoPath } = context;

    const template = createWorkflowTemplate({
      projectId: project.projectId,
      name: 'Needs a missing skill',
      definition: { workflow: { stages: ['plan'] }, stageSkills: { plan: ['not-installed'] } },
    });
    mapProjectWorkItemTemplate({
      projectId: project.projectId,
      workItemType: 'feature',
      templateId: template.templateId,
    });

    expect(() => resolveTemplate(project.projectId, 'feature', { repoPath, validate: true }))
      .toThrowError(context.WorkflowTemplateInvalidError);

    // Resolution failed, so no Work Item row may exist.
    const count = (db.prepare(`SELECT COUNT(*) AS total FROM backlog_features`).get() as { total: number }).total;
    expect(count).toBe(0);
  });

  it('falls back to Repository defaults when no snapshot is supplied', async () => {
    const context = await seedProjectChain('Legacy');
    const { db, epic, createWorkItem } = context;
    db.prepare(`INSERT INTO backlog_catalog_meta (repo_id, repo, version, defaults_json) VALUES (?, ?, ?, ?)`).run(
      'repo-a', 'repo-a', 2, JSON.stringify({ workflow: { stages: ['legacy-stage'] } }),
    );

    const created = createWorkItem({ epicId: epic.epicId, repoId: 'repo-a', title: 'Legacy path' });
    const data = readData(db, created.workItemId);

    expect((data['workflow'] as { stages: string[] }).stages).toEqual(['legacy-stage']);
    expect(data['templateId']).toBeUndefined();
    expect(data['type']).toBe('feature');
  });

  it('exposes project/type mappings for the web state projection', async () => {
    const context = await seedProjectChain('Mappings');
    const { project, createWorkflowTemplate, mapProjectWorkItemTemplate, listProjectTemplateMappings } = context;

    const template = createWorkflowTemplate({
      projectId: project.projectId,
      name: 'Mapped bug flow',
      definition: { workflow: { stages: ['reproduce'] }, stageSkills: { reproduce: [] } },
    });
    mapProjectWorkItemTemplate({
      projectId: project.projectId,
      workItemType: 'bug',
      templateId: template.templateId,
    });

    expect(listProjectTemplateMappings(project.projectId)).toEqual([
      { projectId: project.projectId, workItemType: 'bug', templateId: template.templateId },
    ]);
  });

  /** Creates a `feature` Work Item carrying its resolved builtin snapshot. */
  async function seedFeatureWorkItem(name: string) {
    const context = await seedProjectChain(name);
    const resolved = context.resolveTemplate(context.project.projectId, 'feature');
    const created = context.createWorkItem(
      { epicId: context.epic.epicId, repoId: 'repo-a', title: `${name} item`, type: 'feature' },
      {
        templateId: resolved.templateId,
        templateVersion: resolved.version,
        origin: resolved.origin,
        definition: resolved.definition,
      },
    );
    return { ...context, created };
  }

  it('re-materializes the snapshot when a pristine Work Item changes type', async () => {
    const context = await seedFeatureWorkItem('TypeChange');
    const { db, created, project, resolveTemplate, changeWorkItemType, getWorkItemTemplateTarget } = context;

    const bugTemplate = resolveTemplate(project.projectId, 'bug');
    const updated = changeWorkItemType(created.workItemId, 'bug', {
      templateId: bugTemplate.templateId,
      templateVersion: bugTemplate.version,
      origin: bugTemplate.origin,
      definition: bugTemplate.definition,
    }, created.revision);

    const data = readData(db, created.workItemId);
    expect(data['type']).toBe('bug');
    expect(data['templateId']).toBe(context.BUILTIN_BUG_TEMPLATE_ID);
    expect((data['workflow'] as { stages: string[] }).stages).toEqual([...context.BUG_STAGE_ORDER]);
    expect(data['stageSkills']).toEqual(bugTemplate.definition.stageSkills);
    // The revision must advance so a stale client cannot overwrite this.
    expect(updated.revision).toBe(created.revision + 1);
    // The read path must report the persisted type, not a hardcoded default.
    expect(getWorkItemTemplateTarget(created.workItemId).type).toBe('bug');
  });

  it('refuses a type change once the Work Item has run history', async () => {
    const context = await seedFeatureWorkItem('HasHistory');
    const { db, created, project, resolveTemplate, changeWorkItemType, isWorkItemPristine } = context;

    expect(isWorkItemPristine(created.workItemId)).toBe(true);
    db.prepare(`INSERT INTO runs (repo_id, feature_id, tool, status) VALUES (?, ?, ?, ?)`)
      .run('repo-a', created.workItemId, 'codex', 'done');
    expect(isWorkItemPristine(created.workItemId)).toBe(false);

    const bugTemplate = resolveTemplate(project.projectId, 'bug');
    expect(() => changeWorkItemType(created.workItemId, 'bug', {
      templateId: bugTemplate.templateId,
      templateVersion: bugTemplate.version,
      origin: bugTemplate.origin,
      definition: bugTemplate.definition,
    }, created.revision)).toThrow(context.WorkItemHasHistoryError);

    // The refusal must leave the original snapshot untouched.
    const data = readData(db, created.workItemId);
    expect(data['type']).toBe('feature');
    expect(data['templateId']).toBe(context.BUILTIN_FEATURE_TEMPLATE_ID);
  });

  it('refuses a type change when the expected revision is stale', async () => {
    const context = await seedFeatureWorkItem('StaleRevision');
    const { created, project, resolveTemplate, changeWorkItemType } = context;

    const bugTemplate = resolveTemplate(project.projectId, 'bug');
    expect(() => changeWorkItemType(created.workItemId, 'bug', {
      templateId: bugTemplate.templateId,
      templateVersion: bugTemplate.version,
      origin: bugTemplate.origin,
      definition: bugTemplate.definition,
    }, created.revision + 5)).toThrow(context.RevisionConflictError);
  });
});
