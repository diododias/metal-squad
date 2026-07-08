import type { Command } from 'commander';
import { loadBacklog } from '../core/backlog/load.js';
import { executeBacklog } from '../core/runner/execute.js';
import { validateBacklogSkills } from '../core/skills/index.js';
import { loadConfig } from '../config/index.js';
import { findResumablePipeline, getPipelineSnapshot } from '../db/repo.js';

export function registerResume(program: Command): void {
  program
    .command('resume <target>')
    .description('Retoma uma pipeline pausada/abortada por run-id, feature-id ou repo-id')
    .option('-c, --concurrency <n>', 'runs paralelos globais')
    .action(async (target: string, opts: { concurrency?: string }) => {
      const pipeline = findResumablePipeline(target);
      if (!pipeline) {
        throw new Error(`Nenhuma pipeline retomável encontrada para "${target}".`);
      }
      if (!pipeline.cwd) {
        throw new Error(`Pipeline ${pipeline.id} não possui cwd persistido para resume.`);
      }

      const snapshot = getPipelineSnapshot(pipeline);
      console.log(
        `Retomando pipeline ${pipeline.id} em ${pipeline.cwd}. `
          + `Reaproveita done=[${snapshot.done.join(', ') || '-'}]; `
          + `reexecuta=[${[...snapshot.active, ...snapshot.aborted, ...snapshot.pending].join(', ') || '-'}].`,
      );

      const backlog = loadBacklog(undefined, pipeline.cwd);
      validateBacklogSkills(backlog, pipeline.cwd);
      const concurrency = opts.concurrency
        ? Number(opts.concurrency)
        : loadConfig().concurrency;
      await executeBacklog(backlog, {
        cwd: pipeline.cwd,
        concurrency,
        resumePipelineId: pipeline.id,
        autoAdvanceStages: Boolean(pipeline.autoAdvance),
      });
    });
}
