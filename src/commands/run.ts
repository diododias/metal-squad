import type { Command } from 'commander';
import { loadBacklogFromCatalog } from '../core/backlog/load.js';
import { executeBacklog } from '../core/runner/execute.js';
import { resolveRuntimeConfig } from '../config/index.js';
import { validateBacklogSkills } from '../core/skills/index.js';
import { resolveRepo } from '../core/repo.js';
import { assertWritableDbPath, DbAccessError } from '../db/index.js';

export function registerRun(program: Command): void {
  program
    .command('run')
    .description('Execute the spec-kit workflow from the backlog (dependency graph)')
    .option('-f, --feature <id>', 'run a single feature only')
    .option('-c, --concurrency <n>', 'global parallel runs')
    .action(async (opts: {
      feature?: string;
      concurrency?: string;
    }) => {
      try {
        assertWritableDbPath();

        const cwd = process.cwd();
        const backlog = loadBacklogFromCatalog(resolveRepo(cwd).repoId);
        validateBacklogSkills(backlog, cwd);

        const concurrency = opts.concurrency
          ? Number(opts.concurrency)
          : resolveRuntimeConfig(cwd).concurrency;
        await executeBacklog(backlog, {
          cwd,
          concurrency,
          featureId: opts.feature,
        });
      } catch (error) {
        if (error instanceof DbAccessError) {
          throw new Error(
            `${error.message}\nNo adapter was executed because run persistence failed before the first spawn.`,
          );
        }
        throw error;
      }
    });
}
