import type { Command } from 'commander';
import { createSkillRegistry, formatSkillList } from '../core/skills/index.js';

export function registerSkills(program: Command): void {
  program
    .command('skills')
    .description('Lista as skills disponíveis no repo atual')
    .action(() => {
      const registry = createSkillRegistry();
      const skills = registry.discover(process.cwd());
      console.log(formatSkillList(skills));
    });
}
