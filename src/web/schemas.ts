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

/** Repository links intentionally accept registered repo IDs only. Path
 * registration stays behind PRJ-15B's canonicalization/allowlist boundary. */
export const RepositoryActionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('action:linkRepo'),
    requestId: RequestIdSchema,
    projectId: z.string().min(1),
    repoId: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('action:moveRepo'),
    requestId: RequestIdSchema,
    repoId: z.string().min(1),
    toProjectId: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('action:unlinkRepo'),
    requestId: RequestIdSchema,
    repoId: z.string().min(1),
  }).strict(),
]);

export type RepositoryActionMessage = z.infer<typeof RepositoryActionMessageSchema>;

const EpicPatchSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  position: z.number().int().nonnegative().optional(),
}).strict().refine(
  (patch) => Object.keys(patch).length > 0,
  { message: 'Epic update requires at least one allowed patch field.' },
);

/** Runtime boundary for project-level Epic mutations. The patch remains
 * allowlisted so WebSocket clients cannot alter repo ownership or lifecycle
 * fields outside the dedicated archive/delete flows. */
export const EpicActionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('action:createEpic'),
    requestId: RequestIdSchema,
    projectId: z.string().min(1),
    title: z.string(),
    description: z.string().nullable().optional(),
  }).strict(),
  z.object({
    type: z.literal('action:updateEpic'),
    requestId: RequestIdSchema,
    epicId: z.string().min(1),
    expectedRevision: z.number().int().positive(),
    patch: EpicPatchSchema,
  }).strict(),
]);

export type EpicActionMessage = z.infer<typeof EpicActionMessageSchema>;
