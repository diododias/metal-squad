import type { BacklogV2 } from '../backlog/schema.js';
import { createSkillRegistry } from './registry.js';

export function collectBacklogSkillNames(backlog: BacklogV2): string[] {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defaults set by Zod, but callers may pass raw objects
  const names = new Set<string>(backlog.defaults?.skills ?? []);

  for (const epic of backlog.epics) {
    for (const feature of epic.features) {
      for (const skill of feature.skills ?? []) names.add(skill);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- workflow set by Zod default, but callers may pass raw objects
      for (const stage of feature.workflow?.stages ?? []) names.add(stage);
      for (const task of feature.tasks) {
        for (const skill of task.skills ?? []) names.add(skill);
      }
    }
  }

  return [...names];
}

export function validateBacklogSkills(backlog: BacklogV2, cwd: string): void {
  const registry = createSkillRegistry();
  const names = collectBacklogSkillNames(backlog);
  const result = registry.validate(names, cwd);

  if (!result.valid) {
    throw new Error(`Missing skills referenced in backlog: ${result.missing.join(', ')}`);
  }
}
