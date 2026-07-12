import type { BacklogV2 } from '../backlog/schema.js';
import { resolveRuntimeConfig } from '../../config/index.js';
import { createSkillRegistry } from './registry.js';
import { collectEffectiveStageSkills } from '../workflow/stageSkills.js';

export function collectBacklogSkillNames(
  backlog: BacklogV2,
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defaults set by Zod, but callers may pass raw objects
  stageSkills: Record<string, string[]> = collectEffectiveStageSkills(backlog.defaults?.stageSkills ?? {}),
): string[] {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defaults set by Zod, but callers may pass raw objects
  const names = new Set<string>(backlog.defaults?.skills ?? []);

  for (const epic of backlog.epics) {
    for (const feature of epic.features) {
      for (const skill of feature.skills ?? []) names.add(skill);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defaults set by Zod, but callers may pass raw objects
      for (const stage of feature.workflow?.stages ?? []) {
        const mappedNames = stageSkills[stage];
        if (mappedNames && mappedNames.length > 0) {
          for (const mappedName of mappedNames) names.add(mappedName);
          continue;
        }

        names.add(stage);
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- callers may pass raw backlog-shaped objects in tests
      for (const guidance of Object.values(feature.workflow?.stepGuidance ?? {})) {
        for (const skill of guidance.skills ?? []) names.add(skill);
      }
      for (const task of feature.tasks) {
        for (const skill of task.skills ?? []) names.add(skill);
      }
    }
  }

  return [...names];
}

export function validateBacklogSkills(backlog: BacklogV2, cwd: string): void {
  const config = resolveRuntimeConfig(process.cwd());
  const registry = createSkillRegistry();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defaults set by Zod, but callers may pass raw objects
  const stageSkills = collectEffectiveStageSkills(backlog.defaults?.stageSkills ?? {}, config.stageSkills);
  const names = collectBacklogSkillNames(backlog, stageSkills);
  const result = registry.validate(names, cwd);

  if (!result.valid) {
    throw new Error(`Missing skills referenced in backlog: ${result.missing.join(', ')}`);
  }
}
