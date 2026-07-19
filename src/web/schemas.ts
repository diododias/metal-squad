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
