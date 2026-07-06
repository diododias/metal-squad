import type { Skill } from './types.js';

export function formatSkillList(skills: Skill[]): string {
  if (skills.length === 0) return 'No skills available.';

  const nameWidth = Math.max('NAME'.length, ...skills.map((skill) => skill.name.length));
  const sourceWidth = Math.max('SOURCE'.length, ...skills.map((skill) => skill.source.length));
  const header = `${'NAME'.padEnd(nameWidth)}  ${'SOURCE'.padEnd(sourceWidth)}  DESCRIPTION`;
  const rows = skills.map((skill) => {
    const description = skill.metadata.description || '';
    return `${skill.name.padEnd(nameWidth)}  ${skill.source.padEnd(sourceWidth)}  ${description}`;
  });

  return [header, ...rows].join('\n');
}
