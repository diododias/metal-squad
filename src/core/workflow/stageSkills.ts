export const SYSTEM_STAGE_SKILLS: Record<string, string[]> = {
  specify: ['speckit-specify'],
  plan: ['speckit-plan'],
  tasks: ['speckit-tasks'],
  implement: ['speckit-implement', 'dev-flow'],
  validate: ['review'],
};

export function collectEffectiveStageSkills(
  repoStageSkills: Record<string, string[]> = {},
  configStageSkills: Record<string, string[]> = {},
): Record<string, string[]> {
  return {
    ...SYSTEM_STAGE_SKILLS,
    ...configStageSkills,
    ...repoStageSkills,
  };
}
