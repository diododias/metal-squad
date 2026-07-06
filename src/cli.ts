import { Command } from 'commander';
import { registerInit } from './commands/init.js';
import { registerRun } from './commands/run.js';
import { registerSkills } from './commands/skills.js';
import { registerStatus } from './commands/status.js';
import { registerUi } from './commands/ui.js';

export async function run(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name('msq')
    .description('metal-squad — orquestrador de pipelines spec-kit com IA')
    .version('0.0.1');

  registerInit(program);
  registerRun(program);
  registerSkills(program);
  registerStatus(program);
  registerUi(program);

  await program.parseAsync(argv);
}
