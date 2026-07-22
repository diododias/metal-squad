import { z } from 'zod';

const RequestIdSchema = z.string().min(1);

const ProjectPatchSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
}).strict().refine(
  (patch) => Object.keys(patch).length > 0,
  { message: 'Project update requires at least one allowed patch field.' },
);

/** Runtime boundary for Project mutations received over the WebSocket. Keeping
 * this discriminated by `type` means the server never forwards an unchecked
 * payload or fields outside the service's patch allowlist. */
export const ProjectActionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('action:createProject'),
    requestId: RequestIdSchema,
    name: z.string(),
    description: z.string().nullable().optional(),
  }).strict(),
  z.object({
    type: z.literal('action:updateProject'),
    requestId: RequestIdSchema,
    projectId: z.string().min(1),
    expectedRevision: z.number().int().positive(),
    patch: ProjectPatchSchema,
  }).strict(),
]);

export type ProjectActionMessage = z.infer<typeof ProjectActionMessageSchema>;

/** Runtime boundary for repository-link mutations. Path registration remains
 * deliberately explicit: the service requires `confirm: true` before writing
 * a new repo row. */
export const RepositoryActionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('action:linkRepo'),
    requestId: RequestIdSchema,
    projectId: z.string().min(1),
    repoId: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    confirm: z.boolean().optional(),
  }).strict(),
  z.object({
    type: z.literal('action:moveRepo'),
    requestId: RequestIdSchema,
    repoId: z.string().min(1),
    toProjectId: z.string().min(1),
    expectedRevision: z.number().int().positive().optional(),
  }).strict(),
  z.object({
    type: z.literal('action:unlinkRepo'),
    requestId: RequestIdSchema,
    projectId: z.string().min(1),
    repoId: z.string().min(1),
  }).strict(),
]).superRefine((message, ctx) => {
  if (message.type === 'action:linkRepo' && (message.repoId === undefined) === (message.path === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide exactly one of repoId or path.' });
  }
});

export type RepositoryActionMessage = z.infer<typeof RepositoryActionMessageSchema>;

export const EpicActionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('action:createEpic'),
    requestId: RequestIdSchema,
    projectId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
  }).strict(),
  z.object({
    type: z.literal('action:updateEpic'),
    requestId: RequestIdSchema,
    epicId: z.string().min(1),
    expectedRevision: z.number().int().positive(),
    patch: z.object({
      title: z.string().optional(),
      description: z.string().nullable().optional(),
      status: z.enum(['todo', 'in_progress', 'done']).optional(),
      position: z.number().int().nonnegative().optional(),
    }).strict().refine(
      (patch) => Object.keys(patch).length > 0,
      { message: 'Epic update requires at least one allowed patch field.' },
    ),
  }).strict(),
]);

export type EpicActionMessage = z.infer<typeof EpicActionMessageSchema>;

export const WorkItemTypeActionSchema = z.enum(['feature', 'bug']);

export const WorkItemActionMessageSchema = z.object({
  type: z.literal('action:createWorkItem'),
  requestId: RequestIdSchema,
  epicId: z.string().min(1),
  repoId: z.string().min(1),
  // Optional for compatibility with clients predating PRJ-24; the server
  // resolves the `feature` template when it is omitted.
  workItemType: WorkItemTypeActionSchema.default('feature'),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  dependsOn: z.array(z.string().min(1)).optional(),
}).strict();

export type WorkItemActionMessage = z.infer<typeof WorkItemActionMessageSchema>;

/** Read-only preview of the template a new Work Item would get, resolved from
 * the same inputs `action:createWorkItem` uses (epic + repo + type) — before
 * any Work Item row exists, so `action:changeWorkItemType`'s preview (which
 * needs an existing `workItemId`) does not apply here. */
export const ResolveWorkflowTemplateMessageSchema = z.object({
  type: z.literal('action:resolveWorkflowTemplate'),
  requestId: RequestIdSchema,
  epicId: z.string().min(1),
  repoId: z.string().min(1),
  workItemType: WorkItemTypeActionSchema,
}).strict();

export type ResolveWorkflowTemplateMessage = z.infer<typeof ResolveWorkflowTemplateMessageSchema>;

/** Template management actions (PRJ-24). Each carries `requestId`; mutations
 * that race a concurrent editor carry `expectedRevision`. */
export const WorkflowTemplateActionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('action:createWorkflowTemplate'),
    requestId: RequestIdSchema,
    projectId: z.string().min(1),
    name: z.string().min(1),
    definition: z.unknown(),
  }).strict(),
  z.object({
    type: z.literal('action:updateWorkflowTemplate'),
    requestId: RequestIdSchema,
    templateId: z.string().min(1),
    expectedRevision: z.number().int().nonnegative(),
    patch: z.object({
      name: z.string().min(1).optional(),
      definition: z.unknown().optional(),
    }).refine(
      (patch) => patch.name !== undefined || patch.definition !== undefined,
      { message: 'Workflow template update requires a name or a definition.' },
    ),
  }).strict(),
  z.object({
    type: z.literal('action:duplicateWorkflowTemplate'),
    requestId: RequestIdSchema,
    templateId: z.string().min(1),
    projectId: z.string().min(1),
    name: z.string().min(1).optional(),
  }).strict(),
  z.object({
    type: z.literal('action:archiveWorkflowTemplate'),
    requestId: RequestIdSchema,
    templateId: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('action:setTypeTemplate'),
    requestId: RequestIdSchema,
    projectId: z.string().min(1),
    workItemType: WorkItemTypeActionSchema,
    templateId: z.string().min(1),
  }).strict(),
]);

export type WorkflowTemplateActionMessage = z.infer<typeof WorkflowTemplateActionMessageSchema>;

/** Fetches a template's full definition on demand (PRJ-26) — `state.workflowTemplates`
 * only ever carries the lightweight summary. */
export const WorkflowTemplateDefinitionMessageSchema = z.object({
  type: z.literal('action:getWorkflowTemplateDefinition'),
  requestId: RequestIdSchema,
  templateId: z.string().min(1),
}).strict();

export type WorkflowTemplateDefinitionMessage = z.infer<typeof WorkflowTemplateDefinitionMessageSchema>;

/** Validates a draft definition against every active repo of a Project before
 * save/mapping (PRJ-26), returning a repo×skill matrix instead of a single
 * pass/fail so the UI can pinpoint exactly which repo is missing which skill. */
export const ValidateWorkflowTemplateMessageSchema = z.object({
  type: z.literal('action:validateWorkflowTemplate'),
  requestId: RequestIdSchema,
  projectId: z.string().min(1),
  definition: z.unknown(),
}).strict();

export type ValidateWorkflowTemplateMessage = z.infer<typeof ValidateWorkflowTemplateMessageSchema>;

/** Type change on an existing Work Item. `preview: true` resolves and reports
 * the target snapshot without writing, so the UI can confirm before applying. */
export const WorkItemTypeChangeMessageSchema = z.object({
  type: z.literal('action:changeWorkItemType'),
  requestId: RequestIdSchema,
  workItemId: z.string().min(1),
  workItemType: WorkItemTypeActionSchema,
  expectedRevision: z.number().int().nonnegative(),
  preview: z.boolean().optional().default(false),
}).strict();

export type WorkItemTypeChangeMessage = z.infer<typeof WorkItemTypeChangeMessageSchema>;

/** Lifecycle mutations (PRJ-17): archive / delete / restoreArchive across the
 * three levels. Each carries `expectedRevision` so a concurrent editor loses
 * the race deterministically, and the policy engine runs inside the same write
 * transaction so a concurrent Start cannot slip through. The id field is named
 * per level (`projectId` / `epicId` / `workItemId`) to match each entity's
 * existing action contract. */
const RevisionField = z.number().int().positive();

function projectLifecycle<T extends 'action:archiveProject' | 'action:deleteProject' | 'action:restoreArchivedProject'>(
  type: T,
): z.ZodObject<{ type: z.ZodLiteral<T>; requestId: typeof RequestIdSchema; projectId: z.ZodString; expectedRevision: typeof RevisionField }, 'strict'> {
  return z.object({ type: z.literal(type), requestId: RequestIdSchema, projectId: z.string().min(1), expectedRevision: RevisionField }).strict();
}
function epicLifecycle<T extends 'action:archiveEpic' | 'action:deleteEpic' | 'action:restoreArchivedEpic'>(
  type: T,
): z.ZodObject<{ type: z.ZodLiteral<T>; requestId: typeof RequestIdSchema; epicId: z.ZodString; expectedRevision: typeof RevisionField }, 'strict'> {
  return z.object({ type: z.literal(type), requestId: RequestIdSchema, epicId: z.string().min(1), expectedRevision: RevisionField }).strict();
}
function workItemLifecycle<T extends 'action:archiveWorkItem' | 'action:deleteWorkItem' | 'action:restoreArchivedWorkItem'>(
  type: T,
): z.ZodObject<{ type: z.ZodLiteral<T>; requestId: typeof RequestIdSchema; workItemId: z.ZodString; expectedRevision: typeof RevisionField }, 'strict'> {
  return z.object({ type: z.literal(type), requestId: RequestIdSchema, workItemId: z.string().min(1), expectedRevision: RevisionField }).strict();
}

export const LifecycleActionMessageSchema = z.discriminatedUnion('type', [
  projectLifecycle('action:archiveProject'),
  projectLifecycle('action:deleteProject'),
  projectLifecycle('action:restoreArchivedProject'),
  epicLifecycle('action:archiveEpic'),
  epicLifecycle('action:deleteEpic'),
  epicLifecycle('action:restoreArchivedEpic'),
  workItemLifecycle('action:archiveWorkItem'),
  workItemLifecycle('action:deleteWorkItem'),
  workItemLifecycle('action:restoreArchivedWorkItem'),
]);

/** Runtime boundary for the `/archived` listing query (PRJ-19). `limit` is
 * capped defensively — the client paginates instead of ever requesting an
 * unbounded page. */
export const ArchivedQueryMessageSchema = z.object({
  type: z.literal('action:queryArchived'),
  requestId: RequestIdSchema,
  filters: z.object({
    projectId: z.string().min(1).optional(),
    epicId: z.string().min(1).optional(),
    repoId: z.string().min(1).optional(),
    kind: z.enum(['project', 'epic', 'work_item']).optional(),
  }).strict(),
  limit: z.number().int().positive().max(200),
  offset: z.number().int().nonnegative(),
}).strict();

export type ArchivedQueryMessage = z.infer<typeof ArchivedQueryMessageSchema>;

/** Runtime boundary for the per-entity audit timeline query (PRJ-19). */
export const AuditTrailQueryMessageSchema = z.object({
  type: z.literal('action:queryAuditTrail'),
  requestId: RequestIdSchema,
  entityKind: z.enum(['project', 'epic', 'work_item']),
  entityId: z.string().min(1),
}).strict();

export type AuditTrailQueryMessage = z.infer<typeof AuditTrailQueryMessageSchema>;

export type LifecycleActionMessage = z.infer<typeof LifecycleActionMessageSchema>;
