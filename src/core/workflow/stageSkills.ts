import type { SkillRegistry } from '../skills/types.js';

/** Builtin-backed defaults that work in every repository. */
export const DEFAULT_PROJECT_TEMPLATE: { stages: string[]; stageSkills: Record<string, string[]> } = {
  stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
  stageSkills: {
    specify: ['speckit-specify'],
    plan: ['speckit-plan'],
    tasks: ['speckit-tasks'],
    implement: ['implement'],
    validate: ['review'],
  },
};

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
