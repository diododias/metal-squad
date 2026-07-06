import type { Command } from 'commander';
import { loadBacklog } from '../core/backlog/load.js';
import { executeBacklog } from '../core/runner/execute.js';
import { loadConfig } from '../config/index.js';
import { validateBacklogSkills } from '../core/skills/index.js';

export function registerRun(program: Command): void {
  program
    .command('run')
    .description('Executa o workflow spec-kit do backlog (grafo de dependências)')
    .option('-f, --feature <id>', 'roda apenas uma feature')
    .option('-c, --concurrency <n>', 'runs paralelos globais')
    .action(async (opts: { feature?: string; concurrency?: string }) => {
      const cwd = process.cwd();
      const backlog = loadBacklog(undefined, cwd);
      validateBacklogSkills(backlog, cwd);
      const concurrency = opts.concurrency
        ? Number(opts.concurrency)
        : loadConfig().concurrency;
      await executeBacklog(backlog, {
        cwd,
        concurrency,
        featureId: opts.feature,
      });
    });
}
