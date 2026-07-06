import { z } from 'zod';

export const ToolSchema = z.enum(['claude', 'codex', 'opencode']);
export const EffortSchema = z.enum(['low', 'medium', 'high']);

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['todo', 'running', 'done', 'failed', 'blocked']).default('todo'),
  dependsOn: z.array(z.string()).default([]),
});

export const FeatureSchema = z.object({
  id: z.string(),
  title: z.string(),
  spec: z.string().optional(),
  tool: ToolSchema.default('claude'),
  model: z.string().optional(),
  effort: EffortSchema.default('medium'),
  dependsOn: z.array(z.string()).default([]),
  tasks: z.array(TaskSchema).default([]),
});

export const EpicSchema = z.object({
  id: z.string(),
  title: z.string(),
  features: z.array(FeatureSchema).default([]),
});

export const BacklogSchema = z.object({
  version: z.literal(1).default(1),
  repo: z.string(),
  epics: z.array(EpicSchema).default([]),
});

export type Tool = z.infer<typeof ToolSchema>;
export type Effort = z.infer<typeof EffortSchema>;
export type Feature = z.infer<typeof FeatureSchema>;
export type Epic = z.infer<typeof EpicSchema>;
export type Backlog = z.infer<typeof BacklogSchema>;
