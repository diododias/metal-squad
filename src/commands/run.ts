import type { Command } from 'commander';
import { loadBacklog } from '../core/backlog/load.js';
import { executeBacklog } from '../core/runner/execute.js';
import { loadConfig } from '../config/index.js';
import { validateBacklogSkills } from '../core/skills/index.js';
import { assertWritableDbPath, DbAccessError } from '../db/index.js';

export function registerRun(program: Command): void {
  program
    .command('run')
    .description('Executa o workflow spec-kit do backlog (grafo de dependências)')
    .option('-f, --feature <id>', 'roda apenas uma feature')
    .option('-c, --concurrency <n>', 'runs paralelos globais')
    .action(async (opts: { feature?: string; concurrency?: string }) => {
      try {
        assertWritableDbPath();

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
      } catch (error) {
        if (error instanceof DbAccessError) {
          throw new Error(
            `${error.message}\nNenhum adapter foi executado porque a persistência da run falhou antes do primeiro spawn.`,
          );
        }
        throw error;
      }
    });
}
