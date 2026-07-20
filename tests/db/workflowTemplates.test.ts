import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Workflow template model, versioning and resolution (PRJ-23)', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-workflow-templates-'));
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

  /** A repo checkout that discovers the given skill names as repo skills. */
  function makeRepoWithSkills(names: string[]): string {
    const repoPath = mkdtempSync(join(tmpdir(), 'msq-tpl-repo-'));
    for (const name of names) {
      const skillDir = join(repoPath, '.claude', 'skills', name);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), `# ${name}\n`);
    }
    return repoPath;
  }

  it('seeds both builtins idempotently across repeated migrations', async () => {
    const dbModule = await import('../../src/db/index.js');
    const { listWorkflowTemplates, BUILTIN_FEATURE_TEMPLATE_ID, BUILTIN_BUG_TEMPLATE_ID } = await setup();

    const afterFirst = listWorkflowTemplates();
    expect(afterFirst.map((template) => template.templateId).sort()).toEqual(
      [BUILTIN_BUG_TEMPLATE_ID, BUILTIN_FEATURE_TEMPLATE_ID].sort(),
    );
    expect(afterFirst.every((template) => template.builtin)).toBe(true);
    expect(afterFirst.every((template) => template.scopeProjectId === null)).toBe(true);

    // Reopening the database re-runs migrate(); the seed must neither
    // duplicate the builtins nor overwrite them.
    dbModule.resetDb();
    dbModule.getDb('readwrite');

    const afterSecond = listWorkflowTemplates();
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond.map((template) => template.version)).toEqual([1, 1]);
    expect(afterSecond.map((template) => template.revision)).toEqual([1, 1]);
  });

  it('reproduces the current hardcoded default in the feature builtin without regression', async () => {
    const { getWorkflowTemplate, BUILTIN_FEATURE_TEMPLATE_ID, DEFAULT_PROJECT_TEMPLATE } = await setup();

    const template = getWorkflowTemplate(BUILTIN_FEATURE_TEMPLATE_ID);
    expect(template?.definition.workflow.stages).toEqual(DEFAULT_PROJECT_TEMPLATE.stages);
    expect(template?.definition.stageSkills).toEqual(DEFAULT_PROJECT_TEMPLATE.stageSkills);
  });

  it('defines the bug builtin as reproduce -> fix -> verify', async () => {
    const { getWorkflowTemplate, BUILTIN_BUG_TEMPLATE_ID } = await setup();

    const template = getWorkflowTemplate(BUILTIN_BUG_TEMPLATE_ID);
    expect(template?.definition.workflow.stages).toEqual(['reproduce', 'fix', 'verify']);
    expect(template?.definition.stageSkills).toEqual({
      reproduce: ['bug-reproduce'],
      fix: ['dev-flow'],
      verify: ['review'],
    });
  });

  it('resolves to the builtin per type when the Project has no mapping', async () => {
    const { createProject, resolveTemplate, BUILTIN_FEATURE_TEMPLATE_ID, BUILTIN_BUG_TEMPLATE_ID } = await setup();
    const project = createProject({ name: 'Untapped' });

    expect(resolveTemplate(project.projectId, 'feature')).toMatchObject({
      templateId: BUILTIN_FEATURE_TEMPLATE_ID,
      origin: 'builtin',
      version: 1,
    });
    expect(resolveTemplate(project.projectId, 'bug')).toMatchObject({
      templateId: BUILTIN_BUG_TEMPLATE_ID,
      origin: 'builtin',
    });
  });

  it('prefers the Project mapping over the builtin and reports the origin', async () => {
    const { createProject, createWorkflowTemplate, mapProjectWorkItemTemplate, resolveTemplate } = await setup();
    const project = createProject({ name: 'Mapped' });
    const custom = createWorkflowTemplate({
      projectId: project.projectId,
      name: 'Custom feature flow',
      definition: { workflow: { stages: ['design', 'build'] }, stageSkills: { build: ['implement'] } },
    });

    mapProjectWorkItemTemplate({
      projectId: project.projectId,
      workItemType: 'feature',
      templateId: custom.templateId,
    });

    const resolved = resolveTemplate(project.projectId, 'feature');
    expect(resolved).toMatchObject({ templateId: custom.templateId, origin: 'project-mapping' });
    expect(resolved.definition.workflow.stages).toEqual(['design', 'build']);

    // The mapping is per type: bug still falls back to its builtin.
    expect(resolveTemplate(project.projectId, 'bug').origin).toBe('builtin');
  });

  it('keeps resolution isolated per Project', async () => {
    const { createProject, createWorkflowTemplate, mapProjectWorkItemTemplate, resolveTemplate } = await setup();
    const mapped = createProject({ name: 'Mapped' });
    const untouched = createProject({ name: 'Untouched' });
    const custom = createWorkflowTemplate({
      projectId: mapped.projectId,
      name: 'Only mine',
      definition: { workflow: { stages: ['build'] }, stageSkills: {} },
    });
    mapProjectWorkItemTemplate({ projectId: mapped.projectId, workItemType: 'feature', templateId: custom.templateId });

    expect(resolveTemplate(mapped.projectId, 'feature').origin).toBe('project-mapping');
    expect(resolveTemplate(untouched.projectId, 'feature').origin).toBe('builtin');
  });

  it('increments version and revision on update while leaving a captured snapshot untouched', async () => {
    const { createProject, createWorkflowTemplate, updateWorkflowTemplate, resolveTemplate, mapProjectWorkItemTemplate } = await setup();
    const project = createProject({ name: 'Versioned' });
    const template = createWorkflowTemplate({
      projectId: project.projectId,
      name: 'Evolving',
      definition: { workflow: { stages: ['build'] }, stageSkills: { build: ['implement'] } },
    });
    mapProjectWorkItemTemplate({ projectId: project.projectId, workItemType: 'feature', templateId: template.templateId });

    // A Work Item snapshot (PRJ-24) pins the definition it resolved at creation.
    const snapshot = structuredClone(resolveTemplate(project.projectId, 'feature'));
    expect(snapshot.version).toBe(1);

    const updated = updateWorkflowTemplate(
      template.templateId,
      { definition: { workflow: { stages: ['build', 'verify'] }, stageSkills: { verify: ['review'] } } },
      template.revision,
    );

    expect(updated.version).toBe(2);
    expect(updated.revision).toBe(2);
    expect(updated.definition.workflow.stages).toEqual(['build', 'verify']);
    // The previously captured snapshot must not have changed.
    expect(snapshot.version).toBe(1);
    expect(snapshot.definition.workflow.stages).toEqual(['build']);
  });

  it('rejects a concurrent update via revision conflict', async () => {
    const { createProject, createWorkflowTemplate, updateWorkflowTemplate, RevisionConflictError } = await setup();
    const project = createProject({ name: 'Concurrent' });
    const template = createWorkflowTemplate({
      projectId: project.projectId,
      name: 'Contended',
      definition: { workflow: { stages: ['build'] }, stageSkills: {} },
    });

    updateWorkflowTemplate(template.templateId, { name: 'First writer wins' }, template.revision);

    // Second writer still holds the stale revision it read.
    expect(() => updateWorkflowTemplate(template.templateId, { name: 'Second writer' }, template.revision))
      .toThrow(RevisionConflictError);
  });

  it('refuses to mutate a builtin and offers duplication instead', async () => {
    const {
      createProject, updateWorkflowTemplate, duplicateWorkflowTemplate, archiveWorkflowTemplate,
      WorkflowTemplateImmutableError, BUILTIN_FEATURE_TEMPLATE_ID, getWorkflowTemplate,
    } = await setup();
    const project = createProject({ name: 'Duplicating' });
    const builtin = getWorkflowTemplate(BUILTIN_FEATURE_TEMPLATE_ID);

    expect(() => updateWorkflowTemplate(BUILTIN_FEATURE_TEMPLATE_ID, { name: 'Hijacked' }, builtin?.revision ?? 1))
      .toThrow(WorkflowTemplateImmutableError);
    expect(() => archiveWorkflowTemplate(BUILTIN_FEATURE_TEMPLATE_ID)).toThrow(WorkflowTemplateImmutableError);

    const copy = duplicateWorkflowTemplate(BUILTIN_FEATURE_TEMPLATE_ID, { projectId: project.projectId });
    expect(copy.builtin).toBe(false);
    expect(copy.scopeProjectId).toBe(project.projectId);
    expect(copy.definition).toEqual(builtin?.definition);
    // The copy is editable.
    expect(updateWorkflowTemplate(copy.templateId, { name: 'Tweaked' }, copy.revision).name).toBe('Tweaked');
  });

  it('blocks archiving a mapped template until it is reassociated', async () => {
    const {
      createProject, createWorkflowTemplate, mapProjectWorkItemTemplate, archiveWorkflowTemplate,
      WorkflowTemplateInUseError, BUILTIN_FEATURE_TEMPLATE_ID,
    } = await setup();
    const project = createProject({ name: 'Archiving' });
    const template = createWorkflowTemplate({
      projectId: project.projectId,
      name: 'Mapped then archived',
      definition: { workflow: { stages: ['build'] }, stageSkills: {} },
    });
    mapProjectWorkItemTemplate({ projectId: project.projectId, workItemType: 'feature', templateId: template.templateId });

    expect(() => archiveWorkflowTemplate(template.templateId)).toThrow(WorkflowTemplateInUseError);

    // Reassociate, then archiving succeeds.
    mapProjectWorkItemTemplate({
      projectId: project.projectId,
      workItemType: 'feature',
      templateId: BUILTIN_FEATURE_TEMPLATE_ID,
    });
    expect(archiveWorkflowTemplate(template.templateId).archivedAt).not.toBeNull();
  });

  it('validates skills against the target repo rather than the server cwd', async () => {
    const { createProject, createWorkflowTemplate, WorkflowTemplateInvalidError } = await setup();
    const project = createProject({ name: 'Repo scoped' });
    const definition = { workflow: { stages: ['fix'] }, stageSkills: { fix: ['dev-flow'] } };

    const repoWithSkill = makeRepoWithSkills(['dev-flow']);
    const repoWithoutSkill = makeRepoWithSkills([]);

    try {
      // Same definition: valid in the repo that has the skill...
      expect(
        createWorkflowTemplate({ projectId: project.projectId, name: 'Ok here', definition, repoPath: repoWithSkill }),
      ).toMatchObject({ name: 'Ok here' });

      // ...and invalid in the repo that does not.
      expect(() =>
        createWorkflowTemplate({ projectId: project.projectId, name: 'Missing there', definition, repoPath: repoWithoutSkill }),
      ).toThrow(WorkflowTemplateInvalidError);
    } finally {
      rmSync(repoWithSkill, { recursive: true, force: true });
      rmSync(repoWithoutSkill, { recursive: true, force: true });
    }
  });

  it('accepts the bug builtin skills in a repo providing dev-flow', async () => {
    const { validateTemplateDefinition, getWorkflowTemplate, BUILTIN_BUG_TEMPLATE_ID } = await setup();
    const template = getWorkflowTemplate(BUILTIN_BUG_TEMPLATE_ID);
    // `bug-reproduce` and `review` are builtin skills; only `dev-flow` is repo-scoped.
    const repoPath = makeRepoWithSkills(['dev-flow']);

    try {
      expect(() => validateTemplateDefinition(template?.definition, { repoPath })).not.toThrow();
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('rejects structurally invalid definitions', async () => {
    const { validateTemplateDefinition, WorkflowTemplateInvalidError } = await setup();

    // Duplicated stage.
    expect(() => validateTemplateDefinition({ workflow: { stages: ['build', 'build'] }, stageSkills: {} }))
      .toThrow(WorkflowTemplateInvalidError);
    // Empty stage list.
    expect(() => validateTemplateDefinition({ workflow: { stages: [] }, stageSkills: {} }))
      .toThrow(WorkflowTemplateInvalidError);
    // stageSkills referencing a stage that does not exist.
    expect(() => validateTemplateDefinition({ workflow: { stages: ['build'] }, stageSkills: { verify: ['review'] } }))
      .toThrow(WorkflowTemplateInvalidError);
    // Unsupported workflow mode.
    expect(() => validateTemplateDefinition({ workflow: { mode: 'teleport', stages: ['build'] }, stageSkills: {} }))
      .toThrow(WorkflowTemplateInvalidError);
  });

  it('refuses to map an archived template or one scoped to another Project', async () => {
    const {
      createProject, createWorkflowTemplate, archiveWorkflowTemplate, mapProjectWorkItemTemplate,
      WorkflowTemplateArchivedError, WorkflowTemplateScopeMismatchError,
    } = await setup();
    const owner = createProject({ name: 'Owner' });
    const other = createProject({ name: 'Other' });
    const definition = { workflow: { stages: ['build'] }, stageSkills: {} };

    const foreign = createWorkflowTemplate({ projectId: owner.projectId, name: 'Foreign', definition });
    expect(() => mapProjectWorkItemTemplate({
      projectId: other.projectId, workItemType: 'feature', templateId: foreign.templateId,
    })).toThrow(WorkflowTemplateScopeMismatchError);

    const archived = createWorkflowTemplate({ projectId: owner.projectId, name: 'Archived', definition });
    archiveWorkflowTemplate(archived.templateId);
    expect(() => mapProjectWorkItemTemplate({
      projectId: owner.projectId, workItemType: 'feature', templateId: archived.templateId,
    })).toThrow(WorkflowTemplateArchivedError);
  });

  it('records audit events for create, update, duplicate, archive and map', async () => {
    const {
      db, createProject, createWorkflowTemplate, updateWorkflowTemplate, duplicateWorkflowTemplate,
      archiveWorkflowTemplate, mapProjectWorkItemTemplate, BUILTIN_FEATURE_TEMPLATE_ID,
    } = await setup();
    const project = createProject({ name: 'Audited' });
    const template = createWorkflowTemplate({
      projectId: project.projectId,
      name: 'Audited template',
      definition: { workflow: { stages: ['build'] }, stageSkills: {} },
      audit: { actor: 'alice', requestId: 'request-create' },
    });
    const updated = updateWorkflowTemplate(template.templateId, { name: 'Renamed' }, template.revision);
    duplicateWorkflowTemplate(template.templateId, { projectId: project.projectId });
    mapProjectWorkItemTemplate({
      projectId: project.projectId, workItemType: 'feature', templateId: BUILTIN_FEATURE_TEMPLATE_ID,
    });
    archiveWorkflowTemplate(updated.templateId);

    const actions = db
      .prepare(`SELECT action FROM audit_events WHERE entity_kind = 'workflow_template' ORDER BY id ASC`)
      .all() as Array<{ action: string }>;
    expect(actions.map((row) => row.action)).toEqual(['create', 'update', 'duplicate', 'map', 'archive']);

    const created = db
      .prepare(`SELECT actor, request_id AS requestId FROM audit_events WHERE action = 'create' AND entity_kind = 'workflow_template'`)
      .get() as { actor: string; requestId: string };
    expect(created).toMatchObject({ actor: 'alice', requestId: 'request-create' });
  });
});
