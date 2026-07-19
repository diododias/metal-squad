import { randomUUID } from 'node:crypto';
import {
  WorkflowTemplateDefinitionSchema,
  type WorkflowTemplateDefinition,
} from '../core/backlog/schema.js';
import { createSkillRegistry } from '../core/skills/registry.js';
import {
  BUILTIN_BUG_TEMPLATE_ID,
  BUILTIN_FEATURE_TEMPLATE_ID,
} from '../core/workflow/stageSkills.js';
import { existsSync } from 'node:fs';
import { resolveDbPath } from '../config/index.js';
import { getDb, withTransaction } from './index.js';
import {
  ProjectNotFoundError,
  RevisionConflictError,
  WorkflowTemplateArchivedError,
  WorkflowTemplateImmutableError,
  WorkflowTemplateInUseError,
  WorkflowTemplateInvalidError,
  WorkflowTemplateNotFoundError,
  WorkflowTemplateScopeMismatchError,
} from './errors.js';

export type WorkItemType = 'feature' | 'bug';

/** Where a resolved template came from. Mapping wins; builtin is the floor. */
export type TemplateOrigin = 'project-mapping' | 'builtin';

export interface AuditContext {
  requestId?: string;
  actor?: string;
}

export interface WorkflowTemplateRow {
  templateId: string;
  scopeProjectId: string | null;
  name: string;
  definitionJson: string;
  version: number;
  builtin: number;
  archivedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTemplate extends Omit<WorkflowTemplateRow, 'definitionJson' | 'builtin'> {
  builtin: boolean;
  definition: WorkflowTemplateDefinition;
}

export interface ResolvedTemplate {
  templateId: string;
  name: string;
  version: number;
  origin: TemplateOrigin;
  definition: WorkflowTemplateDefinition;
}

const TEMPLATE_SELECT = `
  SELECT template_id AS templateId, scope_project_id AS scopeProjectId, name,
         definition_json AS definitionJson, version, builtin,
         archived_at AS archivedAt, revision,
         created_at AS createdAt, updated_at AS updatedAt
    FROM workflow_templates`;

/** Builtin fallback per Work Item type. There is no App or Repository fallback. */
const BUILTIN_TEMPLATE_BY_TYPE: Record<WorkItemType, string> = {
  feature: BUILTIN_FEATURE_TEMPLATE_ID,
  bug: BUILTIN_BUG_TEMPLATE_ID,
};

/** Mirrors the guard in `repo.ts`: readers degrade to empty before first migrate. */
function hasDbFile(): boolean {
  const dbPath = resolveDbPath();
  return dbPath === ':memory:' || existsSync(dbPath);
}

function toTemplate(row: WorkflowTemplateRow): WorkflowTemplate {
  const { definitionJson, builtin, ...rest } = row;
  return {
    ...rest,
    builtin: builtin === 1,
    definition: WorkflowTemplateDefinitionSchema.parse(JSON.parse(definitionJson)),
  };
}

/**
 * Structural validation plus skill existence against the *target repo*.
 *
 * `repoPath` matters: `dev-flow` and the speckit skills are repo-scoped, so a
 * template that validates in one checkout can be missing skills in another.
 * Passing no `repoPath` skips only the skill check, never the structural one.
 */
export function validateTemplateDefinition(
  definition: unknown,
  options: { repoPath?: string; name?: string } = {},
): WorkflowTemplateDefinition {
  const parsed = WorkflowTemplateDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    throw new WorkflowTemplateInvalidError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
      options.name,
    );
  }

  if (options.repoPath !== undefined) {
    const names = [...new Set(Object.values(parsed.data.stageSkills).flat())];
    const result = createSkillRegistry().validate(names, options.repoPath);
    if (!result.valid) {
      throw new WorkflowTemplateInvalidError(
        [`missing skills in ${options.repoPath}: ${result.missing.join(', ')}`],
        options.name,
      );
    }
  }

  return parsed.data;
}

export function getWorkflowTemplate(templateId: string): WorkflowTemplate | null {
  if (!hasDbFile()) return null;
  const row = getDb('readonly')
    .prepare(`${TEMPLATE_SELECT} WHERE template_id = ?`)
    .get(templateId) as WorkflowTemplateRow | undefined;
  return row ? toTemplate(row) : null;
}

export function listWorkflowTemplates(
  options: { projectId?: string; includeArchived?: boolean } = {},
): WorkflowTemplate[] {
  if (!hasDbFile()) return [];
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Builtins are global (scope NULL) and always visible to a Project.
  if (options.projectId !== undefined) {
    conditions.push(`(scope_project_id IS NULL OR scope_project_id = ?)`);
    params.push(options.projectId);
  }
  if (options.includeArchived !== true) conditions.push(`archived_at IS NULL`);

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const rows = getDb('readonly')
    .prepare(`${TEMPLATE_SELECT}${where} ORDER BY builtin DESC, name ASC`)
    .all(...params) as WorkflowTemplateRow[];
  return rows.map(toTemplate);
}

export interface ProjectTemplateMapping {
  projectId: string;
  workItemType: WorkItemType;
  templateId: string;
}

/** All `project -> type -> template` mappings, optionally for one Project. */
export function listProjectTemplateMappings(projectId?: string): ProjectTemplateMapping[] {
  if (!hasDbFile()) return [];
  const where = projectId === undefined ? '' : ' WHERE project_id = ?';
  const params = projectId === undefined ? [] : [projectId];
  return getDb('readonly')
    .prepare(
      `SELECT project_id AS projectId, work_item_type AS workItemType, template_id AS templateId
         FROM project_work_item_templates${where}`,
    )
    .all(...params) as ProjectTemplateMapping[];
}

export interface CreateWorkflowTemplateInput {
  projectId: string;
  name: string;
  definition: unknown;
  repoPath?: string;
  audit?: AuditContext;
}

export function createWorkflowTemplate(input: CreateWorkflowTemplateInput): WorkflowTemplate {
  const definition = validateTemplateDefinition(input.definition, {
    repoPath: input.repoPath,
    name: input.name,
  });

  return withTransaction((database) => {
    assertProjectExists(database, input.projectId);
    const templateId = randomUUID();
    database
      .prepare(
        `INSERT INTO workflow_templates
           (template_id, scope_project_id, name, definition_json, version, builtin, revision)
         VALUES (?, ?, ?, ?, 1, 0, 1)`,
      )
      .run(templateId, input.projectId, input.name, JSON.stringify(definition));

    const created = getTemplateFromDatabase(database, templateId);
    if (!created) throw new WorkflowTemplateNotFoundError(templateId);
    recordAuditEvent(database, input.audit, templateId, 'create', null, created);
    return created;
  });
}

export interface UpdateWorkflowTemplatePatch {
  name?: string;
  definition?: unknown;
}

/**
 * Bumps `version` and `revision` together.
 *
 * `version` is what a Work Item snapshot pins (PRJ-24); bumping it here never
 * rewrites a snapshot already materialised, so historical runs keep the exact
 * definition they started with.
 */
export function updateWorkflowTemplate(
  templateId: string,
  patch: UpdateWorkflowTemplatePatch,
  expectedRevision: number,
  options: { repoPath?: string; audit?: AuditContext } = {},
): WorkflowTemplate {
  return withTransaction((database) => {
    const before = getTemplateFromDatabase(database, templateId);
    if (!before) throw new WorkflowTemplateNotFoundError(templateId);
    if (before.builtin) throw new WorkflowTemplateImmutableError(templateId);
    if (before.revision !== expectedRevision) {
      throw new RevisionConflictError(templateId, expectedRevision, before.revision, 'Workflow template');
    }

    const name = patch.name ?? before.name;
    const definition = patch.definition === undefined
      ? before.definition
      : validateTemplateDefinition(patch.definition, { repoPath: options.repoPath, name });

    const result = database
      .prepare(
        `UPDATE workflow_templates
            SET name = ?, definition_json = ?, version = version + 1,
                revision = revision + 1, updated_at = datetime('now')
          WHERE template_id = ? AND revision = ?`,
      )
      .run(name, JSON.stringify(definition), templateId, expectedRevision);

    if (result.changes === 0) {
      const current = getTemplateFromDatabase(database, templateId);
      throw new RevisionConflictError(
        templateId,
        expectedRevision,
        current?.revision ?? before.revision,
        'Workflow template',
      );
    }

    const after = getTemplateFromDatabase(database, templateId);
    if (!after) throw new WorkflowTemplateNotFoundError(templateId);
    recordAuditEvent(database, options.audit, templateId, 'update', before, after);
    return after;
  });
}

/** Duplicates any template — builtin included — into an editable Project-scoped copy. */
export function duplicateWorkflowTemplate(
  templateId: string,
  input: { projectId: string; name?: string; audit?: AuditContext },
): WorkflowTemplate {
  return withTransaction((database) => {
    const source = getTemplateFromDatabase(database, templateId);
    if (!source) throw new WorkflowTemplateNotFoundError(templateId);
    assertProjectExists(database, input.projectId);

    const copyId = randomUUID();
    const name = input.name ?? `${source.name} (copy)`;
    database
      .prepare(
        `INSERT INTO workflow_templates
           (template_id, scope_project_id, name, definition_json, version, builtin, revision)
         VALUES (?, ?, ?, ?, 1, 0, 1)`,
      )
      .run(copyId, input.projectId, name, JSON.stringify(source.definition));

    const copy = getTemplateFromDatabase(database, copyId);
    if (!copy) throw new WorkflowTemplateNotFoundError(copyId);
    recordAuditEvent(database, input.audit, copyId, 'duplicate', source, copy);
    return copy;
  });
}

/** Archiving is refused while any Project still maps the template. */
export function archiveWorkflowTemplate(
  templateId: string,
  options: { audit?: AuditContext } = {},
): WorkflowTemplate {
  return withTransaction((database) => {
    const before = getTemplateFromDatabase(database, templateId);
    if (!before) throw new WorkflowTemplateNotFoundError(templateId);
    if (before.builtin) throw new WorkflowTemplateImmutableError(templateId);

    const mappings = database
      .prepare(
        `SELECT project_id AS projectId, work_item_type AS workItemType
           FROM project_work_item_templates WHERE template_id = ?`,
      )
      .all(templateId) as { projectId: string; workItemType: string }[];
    if (mappings.length > 0) throw new WorkflowTemplateInUseError(templateId, mappings);

    database
      .prepare(
        `UPDATE workflow_templates
            SET archived_at = datetime('now'), revision = revision + 1, updated_at = datetime('now')
          WHERE template_id = ?`,
      )
      .run(templateId);

    const after = getTemplateFromDatabase(database, templateId);
    if (!after) throw new WorkflowTemplateNotFoundError(templateId);
    recordAuditEvent(database, options.audit, templateId, 'archive', before, after);
    return after;
  });
}

export function mapProjectWorkItemTemplate(input: {
  projectId: string;
  workItemType: WorkItemType;
  templateId: string;
  audit?: AuditContext;
}): void {
  withTransaction((database) => {
    assertProjectExists(database, input.projectId);
    const template = getTemplateFromDatabase(database, input.templateId);
    if (!template) throw new WorkflowTemplateNotFoundError(input.templateId);
    if (template.archivedAt !== null) throw new WorkflowTemplateArchivedError(input.templateId);
    if (template.scopeProjectId !== null && template.scopeProjectId !== input.projectId) {
      throw new WorkflowTemplateScopeMismatchError(input.templateId, input.projectId);
    }

    const before = database
      .prepare(
        `SELECT project_id AS projectId, work_item_type AS workItemType, template_id AS templateId
           FROM project_work_item_templates WHERE project_id = ? AND work_item_type = ?`,
      )
      .get(input.projectId, input.workItemType) ?? null;

    database
      .prepare(
        `INSERT INTO project_work_item_templates (project_id, work_item_type, template_id)
         VALUES (?, ?, ?)
         ON CONFLICT(project_id, work_item_type)
         DO UPDATE SET template_id = excluded.template_id, updated_at = datetime('now')`,
      )
      .run(input.projectId, input.workItemType, input.templateId);

    recordAuditEvent(database, input.audit, input.templateId, 'map', before, {
      projectId: input.projectId,
      workItemType: input.workItemType,
      templateId: input.templateId,
    });
  });
}

/**
 * Deterministic template resolution.
 *
 * Precedence is exactly two levels: the Project's `type -> template` mapping,
 * then the builtin for that type. There is deliberately no App-level or
 * Repository-defaults fallback — a Work Item inherits Repository defaults for
 * *execution*, but its workflow template comes from the Project.
 *
 * `repoPath` is optional and only enables skill validation against the target
 * repo; it never influences which template is chosen.
 */
export function resolveTemplate(
  projectId: string,
  workItemType: WorkItemType,
  options: { repoPath?: string; validate?: boolean } = {},
): ResolvedTemplate {
  const mapped = hasDbFile()
    ? (getDb('readonly')
        .prepare(
          `SELECT template_id AS templateId
             FROM project_work_item_templates
            WHERE project_id = ? AND work_item_type = ?`,
        )
        .get(projectId, workItemType) as { templateId: string } | undefined)
    : undefined;

  const mappedTemplate = mapped ? getWorkflowTemplate(mapped.templateId) : null;

  // The builtin is the floor for three cases: no mapping at all, a mapping
  // pointing at a row that no longer exists, and a mapping whose template has
  // been archived. Only a live mapped template keeps `project-mapping` origin.
  const useMapping = mappedTemplate !== null && mappedTemplate.archivedAt === null;
  const origin: TemplateOrigin = useMapping ? 'project-mapping' : 'builtin';
  const template = useMapping
    ? mappedTemplate
    : getWorkflowTemplate(BUILTIN_TEMPLATE_BY_TYPE[workItemType]);

  if (!template) throw new WorkflowTemplateNotFoundError(BUILTIN_TEMPLATE_BY_TYPE[workItemType]);

  if (options.validate === true) {
    validateTemplateDefinition(template.definition, { repoPath: options.repoPath, name: template.name });
  }

  return {
    templateId: template.templateId,
    name: template.name,
    version: template.version,
    origin,
    definition: template.definition,
  };
}

function getTemplateFromDatabase(
  database: ReturnType<typeof getDb>,
  templateId: string,
): WorkflowTemplate | null {
  const row = database
    .prepare(`${TEMPLATE_SELECT} WHERE template_id = ?`)
    .get(templateId) as WorkflowTemplateRow | undefined;
  return row ? toTemplate(row) : null;
}

function assertProjectExists(database: ReturnType<typeof getDb>, projectId: string): void {
  const row = database
    .prepare(`SELECT 1 AS present FROM projects WHERE project_id = ? AND deleted_at IS NULL`)
    .get(projectId) as { present: number } | undefined;
  if (!row) throw new ProjectNotFoundError(projectId);
}

function recordAuditEvent(
  database: ReturnType<typeof getDb>,
  context: AuditContext | undefined,
  templateId: string,
  action: string,
  before: unknown,
  after: unknown,
): void {
  database
    .prepare(
      `INSERT INTO audit_events (request_id, actor, entity_kind, entity_id, action, before_json, after_json)
       VALUES (?, ?, 'workflow_template', ?, ?, ?, ?)`,
    )
    .run(
      context?.requestId ?? randomUUID(),
      context?.actor ?? 'system',
      templateId,
      action,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
    );
}
