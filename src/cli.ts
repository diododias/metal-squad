import { Command } from 'commander';
import { registerInit } from './commands/init.js';
import { registerBacklog } from './commands/backlog.js';
import { registerRun } from './commands/run.js';
import { registerDecompose } from './commands/decompose.js';
import { registerResume } from './commands/resume.js';
import { registerSkills } from './commands/skills.js';
import { registerStatus } from './commands/status.js';
import { registerStats } from './commands/stats.js';
import { registerConfig } from './commands/config.js';
import { registerUi } from './commands/ui.js';
import { registerWeb } from './commands/web.js';
import { registerDaemon } from './commands/daemon.js';
import { registerProjects } from './commands/projects.js';
import { registerEpics } from './commands/epics.js';
import { initConfig } from './config/index.js';

export async function run(argv: string[]): Promise<void> {
  initConfig();

  const program = new Command();

  program
    .name('msq')
    .description('metal-squad — orquestrador de pipelines spec-kit com IA')
    .version('0.0.1');

  registerInit(program);
  registerBacklog(program);
  registerRun(program);
  registerDecompose(program);
  registerResume(program);
  registerSkills(program);
  registerStatus(program);
  registerStats(program);
  registerConfig(program);
  registerUi(program);
  registerWeb(program);
  registerDaemon(program);
  registerProjects(program);
  registerEpics(program);

  await program.parseAsync(argv);
}
