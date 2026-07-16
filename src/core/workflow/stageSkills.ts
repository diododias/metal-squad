/** Project-owned defaults retained for existing Spec Kit projects. */
export const DEFAULT_PROJECT_TEMPLATE: { stages: string[]; stageSkills: Record<string, string[]> } = {
  stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
  stageSkills: {
    specify: ['speckit-specify'],
    plan: ['speckit-plan'],
    tasks: ['speckit-tasks'],
    implement: ['speckit-implement', 'dev-flow'],
    validate: ['review'],
  },
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
