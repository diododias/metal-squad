import type { Command } from 'commander';
import { loadBacklogFromCatalog } from '../core/backlog/load.js';
import { EffortSchema, ToolSchema } from '../core/backlog/schema.js';
import { executeBacklog } from '../core/runner/execute.js';
import { loadConfig } from '../config/index.js';
import { validateBacklogSkills } from '../core/skills/index.js';
import { resolveRepo } from '../core/repo.js';
import { assertWritableDbPath, DbAccessError } from '../db/index.js';

export function registerRun(program: Command): void {
  program
    .command('run')
    .description('Execute the spec-kit workflow from the backlog (dependency graph)')
    .option('-f, --feature <id>', 'run a single feature only')
    .option('-c, --concurrency <n>', 'global parallel runs')
    .option('--auto-advance-stages', 'advance staged steps without manual Telegram approval')
    .option('--tool <tool>', 'one-off tool override for --feature (this run only; use the web UI to persist)')
    .option('--model <model>', 'one-off model override for --feature (this run only; use the web UI to persist)')
    .option('--effort <effort>', 'one-off effort override for --feature (this run only; use the web UI to persist)')
    .action(async (opts: {
      feature?: string;
      concurrency?: string;
      autoAdvanceStages?: boolean;
      tool?: string;
      model?: string;
      effort?: string;
    }) => {
      try {
        assertWritableDbPath();

        const cwd = process.cwd();
        const backlog = loadBacklogFromCatalog(resolveRepo(cwd).repoId);
        validateBacklogSkills(backlog, cwd);

        // F34 5d: one-off tool/model/effort override for a single-feature run,
        // requested by the web FeaturePreview start action. Mutates the
        // in-memory backlog only — the DB catalog row is never touched. For
        // durable edits use the web UI's "save config" action (F36), which
        // persists via updateCatalogFeature.
        if (opts.feature && (opts.tool || opts.model || opts.effort)) {
          const feature = backlog.epics
            .flatMap((epic) => epic.features)
            .find((f) => f.id === opts.feature);
          if (feature) {
            if (opts.tool) feature.tool = ToolSchema.parse(opts.tool);
            if (opts.model) feature.model = opts.model;
            if (opts.effort) feature.effort = EffortSchema.parse(opts.effort);
          }
        }

        const concurrency = opts.concurrency
          ? Number(opts.concurrency)
          : loadConfig().concurrency;
        await executeBacklog(backlog, {
          cwd,
          concurrency,
          featureId: opts.feature,
          autoAdvanceStages: Boolean(opts.autoAdvanceStages),
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
