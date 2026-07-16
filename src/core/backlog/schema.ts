import { z } from 'zod';

export const ToolSchema = z.enum(['claude', 'codex', 'opencode']);
export const EffortSchema = z.enum(['low', 'medium', 'high']);
export const ThinkingSchema = z.enum(['on', 'off']);
export const WorkflowModeSchema = z.enum(['single', 'staged']);
/** A configured notification channel type (for example `slack` or `desktop`).
 * Availability and credentials are validated against the runtime notification
 * config when the workflow is saved or an approval is dispatched. */
export const WorkflowApprovalChannelSchema = z.string().trim().min(1);
export const OnFailSchema = z.enum(['stop', 'continue', 'gate']);
export const SessionPolicyModeSchema = z.enum(['isolated', 'adaptive']);
export const FallbackAlternativeSchema = z.object({
  tool: ToolSchema,
  model: z.string().optional(),
  effort: EffortSchema.optional(),
  maxAttempts: z.number().int().min(1).max(10).default(1),
});
export const RetrySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(1),
  backoffMs: z.number().int().min(0).default(5000),
  onFail: OnFailSchema.default('stop'),
  fallback: z.array(FallbackAlternativeSchema).default([]),
});

export const BudgetSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  perFeatureMaxTokens: z.number().int().positive().optional(),
});
export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['todo', 'running', 'done', 'failed', 'blocked']).default('todo'),
  dependsOn: z.array(z.string()).default([]),
  taskFile: z.string().optional(),
  skills: z.array(z.string()).optional(),
});

export const WorkflowApprovalsSchema = z.object({
  channel: WorkflowApprovalChannelSchema.default('telegram'),
  autoAdvance: z.boolean().default(false),
});

export const WorkflowSessionPolicySchema = z.object({
  mode: SessionPolicyModeSchema.default('isolated'),
  alwaysIsolatedStages: z.array(z.string().min(1)).default([]),
});

export const StepGuidanceSchema = z.object({
  skills: z.array(z.string()).optional(),
  prompt: z.string().optional(),
});

export const WorkflowSchema = z.object({
  mode: WorkflowModeSchema.default('staged'),
  stages: z.array(z.string()).min(1).default(['specify', 'plan', 'tasks', 'implement', 'validate']),
  approvals: WorkflowApprovalsSchema.default({}),
  syncTasksToBacklog: z.boolean().default(true),
  sessionPolicy: WorkflowSessionPolicySchema.default({}),
  stepGuidance: z.record(z.string(), StepGuidanceSchema).default({}),
}).superRefine((workflow, ctx) => {
  const seen = new Set<string>();
  for (const [index, stage] of workflow.sessionPolicy.alwaysIsolatedStages.entries()) {
    if (!workflow.stages.includes(stage)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sessionPolicy', 'alwaysIsolatedStages', index],
        message: `Stage "${stage}" must exist in workflow.stages.`,
      });
    }
    if (seen.has(stage)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sessionPolicy', 'alwaysIsolatedStages', index],
        message: `Stage "${stage}" is duplicated in sessionPolicy.alwaysIsolatedStages.`,
      });
    }
    seen.add(stage);
  }

  for (const [stage, guidance] of Object.entries(workflow.stepGuidance)) {
    if (!workflow.stages.includes(stage)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stepGuidance', stage],
        message: `Stage "${stage}" must exist in workflow.stages.`,
      });
    }
    if ((guidance.skills?.length ?? 0) === 0 && guidance.prompt === undefined) {
      continue;
    }
  }
});

export const DefaultsSchema = z.object({
  tool: ToolSchema.default('claude'),
  model: z.string().trim().min(1).optional(),
  effort: EffortSchema.default('medium'),
  thinking: ThinkingSchema.default('off'),
  skills: z.array(z.string()).default([]),
  stageSkills: z.record(z.string(), z.array(z.string())).default({}),
  workflow: WorkflowSchema.default({}),
  maxTokens: z.number().int().positive().optional(),
});

export const FeatureSchema = z.object({
  id: z.string(),
  title: z.string(),
  spec: z.string().optional(),
  tool: ToolSchema.default('claude'),
  model: z.string().optional(),
  effort: EffortSchema.default('medium'),
  thinking: ThinkingSchema.default('off'),
  dependsOn: z.array(z.string()).default([]),
  tasks: z.array(TaskSchema).default([]),
  skills: z.array(z.string()).optional(),
  specFile: z.string().optional(),
  context: z.array(z.string()).optional(),
  workflow: WorkflowSchema.default({}),
  retry: RetrySchema.optional(),
  maxTokens: z.number().int().positive().optional(),
  autoStart: z.boolean().default(false),
});

/** Authoring shape accepted by backlog.yaml before registration assigns an id. */
export const FeatureInputSchema = FeatureSchema.extend({
  id: z.string().optional(),
});

export const EpicSchema = z.object({
  id: z.string(),
  title: z.string(),
  features: z.array(FeatureSchema).default([]),
});

export const EpicInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  features: z.array(FeatureInputSchema).default([]),
});

export const BacklogV1Schema = z.object({
  version: z.literal(1).default(1 as const),
  repo: z.string(),
  budget: BudgetSchema.optional(),
  epics: z.array(EpicSchema).default([]),
});

export const BacklogV1InputSchema = z.object({
  version: z.literal(1).default(1 as const),
  repo: z.string(),
  budget: BudgetSchema.optional(),
  epics: z.array(EpicInputSchema).default([]),
});

export const BacklogV2Schema = z.object({
  version: z.literal(2),
  repo: z.string(),
  defaults: DefaultsSchema.default({}),
  budget: BudgetSchema.optional(),
  epics: z.array(EpicSchema).default([]),
});

export const BacklogV2InputSchema = z.object({
  version: z.literal(2),
  repo: z.string(),
  defaults: DefaultsSchema.default({}),
  budget: BudgetSchema.optional(),
  epics: z.array(EpicInputSchema).default([]),
});

export const BacklogSchema = z.union([BacklogV1Schema, BacklogV2Schema]);
export const BacklogInputSchema = z.union([BacklogV1InputSchema, BacklogV2InputSchema]);

export type Tool = z.infer<typeof ToolSchema>;
export type Effort = z.infer<typeof EffortSchema>;
export type Thinking = z.infer<typeof ThinkingSchema>;
export type OnFail = z.infer<typeof OnFailSchema>;
export type SessionPolicyMode = z.infer<typeof SessionPolicyModeSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type Retry = z.infer<typeof RetrySchema>;
export type FallbackAlternative = z.infer<typeof FallbackAlternativeSchema>;
export type Defaults = z.infer<typeof DefaultsSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type WorkflowApprovals = z.infer<typeof WorkflowApprovalsSchema>;
export type WorkflowSessionPolicy = z.infer<typeof WorkflowSessionPolicySchema>;
export type StepGuidance = z.infer<typeof StepGuidanceSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type Feature = z.infer<typeof FeatureSchema>;
export type FeatureInput = z.infer<typeof FeatureInputSchema>;
export type Epic = z.infer<typeof EpicSchema>;
export type EpicInput = z.infer<typeof EpicInputSchema>;
export type BacklogV1 = z.infer<typeof BacklogV1Schema>;
export type BacklogV1Input = z.infer<typeof BacklogV1InputSchema>;
export type BacklogV2 = z.infer<typeof BacklogV2Schema>;
export type BacklogV2Input = z.infer<typeof BacklogV2InputSchema>;
export type Backlog = z.infer<typeof BacklogSchema>;
