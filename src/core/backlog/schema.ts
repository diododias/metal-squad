import { z } from 'zod';
import { DEFAULT_PROJECT_TEMPLATE } from '../workflow/stageSkills.js';
export { DEFAULT_PROJECT_TEMPLATE } from '../workflow/stageSkills.js';

export const AdapterSchema = z.enum(['claude', 'codex', 'opencode']);
export const ToolSchema = z.string().trim().min(1).regex(
  /^[a-z][a-z0-9-]*$/,
  'Tool id must use lowercase letters, numbers, and hyphens.',
);

/**
 * Builds the runtime validation for a backlog `tool` reference. The registry
 * itself lives in runtime config, so this cannot be a fixed enum.
 */
export function createRegisteredToolSchema(registeredToolIds: readonly string[]): z.ZodType<string> {
  const registered = new Set(registeredToolIds);
  const available = [...registered].sort();

  return ToolSchema.superRefine((tool, ctx) => {
    if (!registered.has(tool)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Tool "${tool}" is not registered. Register it in config.tools or use one of: ${available.join(', ')}.`,
      });
    }
  });
}
export const EffortSchema = z.enum(['low', 'medium', 'high']);
export const ThinkingSchema = z.enum(['on', 'off']);
export const DependencyTypeSchema = z.enum(['stack', 'logical']);
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
});

export const WorkflowSessionPolicySchema = z.object({
  mode: SessionPolicyModeSchema.default('isolated'),
  alwaysIsolatedStages: z.array(z.string().min(1)).default([]),
});

export const StepGuidanceSchema = z.object({
  skills: z.array(z.string()).optional(),
  prompt: z.string().optional(),
});

const WorkflowSchemaShape = z.object({
  mode: WorkflowModeSchema.default('staged'),
  stages: z.array(z.string()).min(1).default([...DEFAULT_PROJECT_TEMPLATE.stages]),
  approvals: WorkflowApprovalsSchema.default({}),
  autoAdvance: z.boolean().default(false),
  syncTasksToBacklog: z.boolean().default(true),
  sessionPolicy: WorkflowSessionPolicySchema.default({}),
  stepGuidance: z.record(z.string(), StepGuidanceSchema).default({}),
  stagePublishes: z.record(z.string(), z.boolean()).default({}),
});

/** Normalizes the former approvals.autoAdvance input into workflow.autoAdvance. */
export const WorkflowSchema = z.preprocess((value) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const workflow = value as Record<string, unknown>;
  const approvals = workflow.approvals;
  if (typeof approvals !== 'object' || approvals === null || Array.isArray(approvals)) return workflow;
  const { autoAdvance: legacyAutoAdvance, ...normalizedApprovals } = approvals as Record<string, unknown>;
  return {
    ...workflow,
    ...(workflow.autoAdvance === undefined && typeof legacyAutoAdvance === 'boolean' ? { autoAdvance: legacyAutoAdvance } : {}),
    approvals: normalizedApprovals,
  };
}, WorkflowSchemaShape).superRefine((workflow, ctx) => {
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

  for (const stage of Object.keys(workflow.stagePublishes)) {
    if (!workflow.stages.includes(stage)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stagePublishes', stage],
        message: `Stage "${stage}" must exist in workflow.stages.`,
      });
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

const FeatureSchemaShape = z.object({
  id: z.string(),
  title: z.string(),
  spec: z.string().optional(),
  tool: ToolSchema.default('claude'),
  model: z.string().optional(),
  effort: EffortSchema.default('medium'),
  thinking: ThinkingSchema.default('off'),
  dependsOn: z.array(z.string()).default([]),
  dependencyTypes: z.record(z.string(), DependencyTypeSchema).optional(),
  tasks: z.array(TaskSchema).default([]),
  skills: z.array(z.string()).optional(),
  specFile: z.string().optional(),
  context: z.array(z.string()).optional(),
  workflow: WorkflowSchema.default({}),
  retry: RetrySchema.optional(),
  maxTokens: z.number().int().positive().optional(),
  autoStart: z.boolean().default(false),
});

function validateDependencyTypes(
  feature: { dependsOn?: string[]; dependencyTypes?: Record<string, DependencyType> },
  ctx: z.RefinementCtx,
): void {
  for (const dependencyId of Object.keys(feature.dependencyTypes ?? {})) {
    if (!feature.dependsOn?.includes(dependencyId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dependencyTypes', dependencyId],
        message: `dependencyTypes entry "${dependencyId}" must also appear in dependsOn.`,
      });
    }
  }
}

export const FeatureSchema = FeatureSchemaShape.superRefine(validateDependencyTypes);

/**
 * Authoring shape accepted from the YAML asset. Execution fields deliberately
 * remain optional here: project defaults are applied from the catalog, not
 * from values embedded in backlog.yaml.
 */
const FeatureInputSchemaShape = z.object({
  id: z.string().optional(),
  title: z.string(),
  spec: z.string().optional(),
  tool: ToolSchema.optional(),
  model: z.string().optional(),
  effort: EffortSchema.optional(),
  thinking: ThinkingSchema.optional(),
  dependsOn: z.array(z.string()).optional(),
  dependencyTypes: z.record(z.string(), DependencyTypeSchema).optional(),
  tasks: z.array(TaskSchema).optional(),
  skills: z.array(z.string()).optional(),
  specFile: z.string().optional(),
  context: z.array(z.string()).optional(),
  workflow: WorkflowSchema.optional(),
  retry: RetrySchema.optional(),
  maxTokens: z.number().int().positive().optional(),
  autoStart: z.boolean().optional(),
});

export const FeatureInputSchema = FeatureInputSchemaShape.superRefine(validateDependencyTypes);

export const EpicStatusSchema = z.enum(['todo', 'in_progress', 'done']);

export const EpicSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: EpicStatusSchema.default('todo'),
  features: z.array(FeatureSchema).default([]),
});

export const EpicInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: EpicStatusSchema.optional(),
  features: z.array(FeatureInputSchema).default([]),
});

/**
 * Work Item is the forward-looking name for a backlog Feature row. It
 * currently wraps FeatureSchema unchanged and adds `description` as a
 * functional summary kept separate from `spec` (the technical spec).
 */
export const WorkItemSchema = FeatureSchema.and(z.object({
  description: z.string().optional(),
}));

export const WorkItemInputSchema = FeatureInputSchema.and(z.object({
  description: z.string().optional(),
}));

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
  /** Legacy input is accepted and discarded by the loader with a warning. */
  defaults: DefaultsSchema.optional(),
  budget: BudgetSchema.optional(),
  epics: z.array(EpicInputSchema).default([]),
});

export const BacklogSchema = z.union([BacklogV1Schema, BacklogV2Schema]);
export const BacklogInputSchema = z.union([BacklogV1InputSchema, BacklogV2InputSchema]);

export type Tool = z.infer<typeof ToolSchema>;
export type Effort = z.infer<typeof EffortSchema>;
export type Thinking = z.infer<typeof ThinkingSchema>;
export type DependencyType = z.infer<typeof DependencyTypeSchema>;
export type WorkflowMode = z.infer<typeof WorkflowModeSchema>;
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
export type EpicStatus = z.infer<typeof EpicStatusSchema>;
export type Epic = z.infer<typeof EpicSchema>;
export type EpicInput = z.infer<typeof EpicInputSchema>;
export type WorkItem = z.infer<typeof WorkItemSchema>;
export type WorkItemInput = z.infer<typeof WorkItemInputSchema>;
export type BacklogV1 = z.infer<typeof BacklogV1Schema>;
export type BacklogV1Input = z.infer<typeof BacklogV1InputSchema>;
export type BacklogV2 = z.infer<typeof BacklogV2Schema>;
export type BacklogV2Input = z.infer<typeof BacklogV2InputSchema>;
export type Backlog = z.infer<typeof BacklogSchema>;

/** Returns the declared type for a dependency, defaulting to stack for legacy backlogs. */
export function dependencyType(feature: Pick<Feature, 'dependencyTypes'>, dependencyId: string): DependencyType {
  return feature.dependencyTypes?.[dependencyId] ?? 'stack';
}

/** Dependencies whose published branch/PR may be used as a stacked base. */
export function stackDependencies(feature: Pick<Feature, 'dependsOn' | 'dependencyTypes'>): string[] {
  return feature.dependsOn.filter((dependencyId) => dependencyType(feature, dependencyId) === 'stack');
}
