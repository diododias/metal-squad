import type { SkillRegistry } from '../skills/types.js';
import { STAGE_ORDER } from './stageOrder.js';

/** Builtin-backed defaults that work in every repository. */
export const DEFAULT_PROJECT_TEMPLATE: { stages: string[]; stageSkills: Record<string, string[]> } = {
  stages: [...STAGE_ORDER],
  stageSkills: {
    specify: ['speckit-specify'],
    plan: ['speckit-plan'],
    tasks: ['speckit-tasks'],
    implement: ['implement'],
    validate: ['review'],
  },
};

/** Stable ids of the seeded builtin templates (PRJ-23). */
export const BUILTIN_FEATURE_TEMPLATE_ID = 'builtin:feature-spec-kit';
export const BUILTIN_BUG_TEMPLATE_ID = 'builtin:bug-standard';

/** Canonical stage order for the builtin bug workflow. */
export const BUG_STAGE_ORDER = ['reproduce', 'fix', 'verify'] as const;

/**
 * Builtin template definitions seeded into `workflow_templates`.
 *
 * `feature-spec-kit` mirrors `DEFAULT_PROJECT_TEMPLATE` exactly so promoting the
 * hardcoded default to a persisted template is not a behaviour change. Optional
 * enhancements (`speckit-implement`, `dev-flow`) stay out of it: they live in
 * `DEFAULT_PROJECT_STAGE_SKILL_PREFERENCES` and are applied only when the target
 * repo actually discovers them.
 */
export const BUILTIN_WORKFLOW_TEMPLATES: {
  templateId: string;
  name: string;
  workItemType: 'feature' | 'bug';
  definition: { workflow: { stages: string[] }; stageSkills: Record<string, string[]> };
}[] = [
  {
    templateId: BUILTIN_FEATURE_TEMPLATE_ID,
    name: 'Feature — Spec Kit',
    workItemType: 'feature',
    definition: {
      workflow: { stages: [...DEFAULT_PROJECT_TEMPLATE.stages] },
      stageSkills: { ...DEFAULT_PROJECT_TEMPLATE.stageSkills },
    },
  },
  {
    templateId: BUILTIN_BUG_TEMPLATE_ID,
    name: 'Bug — Standard',
    workItemType: 'bug',
    definition: {
      workflow: { stages: [...BUG_STAGE_ORDER] },
      stageSkills: {
        reproduce: ['bug-reproduce'],
        fix: ['dev-flow'],
        verify: ['review'],
      },
    },
  },
];

/** Optional project enhancements, never required for a stage to run. */
export const DEFAULT_PROJECT_STAGE_SKILL_PREFERENCES: Record<string, string[]> = {
  implement: ['speckit-implement', 'dev-flow'],
};

export function collectEffectiveStageSkills(
  repoStageSkills: Record<string, string[]> = {},
  configStageSkills: Record<string, string[]> = {},
): Record<string, string[]> {
  return {
    ...DEFAULT_PROJECT_TEMPLATE.stageSkills,
    ...configStageSkills,
    ...repoStageSkills,
  };
}

/**
 * Returns discovered project preferences when available, otherwise the
 * builtin-backed default. Missing preference names never reach a prompt.
 */
export function resolveDefaultStageSkillNames(
  stage: string,
  registry: Pick<SkillRegistry, 'has'>,
  cwd: string,
): string[] {
  const preferences = DEFAULT_PROJECT_STAGE_SKILL_PREFERENCES[stage] ?? [];
  const discoveredPreferences = preferences.filter((name) => registry.has(name, cwd));
  return discoveredPreferences.length > 0
    ? discoveredPreferences
    : (DEFAULT_PROJECT_TEMPLATE.stageSkills[stage] ?? []);
}
