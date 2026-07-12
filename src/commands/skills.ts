import type { Command } from 'commander';
import { createSkillRegistry, formatSkillList } from '../core/skills/index.js';

export function registerSkills(program: Command): void {
  program
    .command('skills')
    .description('List available skills in current repo')
    .action(() => {
      const registry = createSkillRegistry();
      const skills = registry.discover(process.cwd());
      console.log(formatSkillList(skills));
    });
}
