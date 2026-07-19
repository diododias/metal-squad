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
