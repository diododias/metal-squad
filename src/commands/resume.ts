import { Option, type Command } from 'commander';
import { loadBacklogFromCatalog } from '../core/backlog/load.js';
import { executeBacklog } from '../core/runner/execute.js';
import { validateBacklogSkills } from '../core/skills/index.js';
import { loadConfig } from '../config/index.js';
import { findResumablePipeline, getPipelineSnapshot } from '../db/repo.js';
import { getAdapter } from '../core/adapters/index.js';
import type { Effort, Tool } from '../core/backlog/schema.js';

interface ResumeCliOptions {
  concurrency?: string;
  tool?: Tool;
  model?: string;
  effort?: Effort;
}

export function registerResume(program: Command): void {
  program
    .command('resume <target>')
    .description('Retoma uma pipeline pausada/abortada por run-id, feature-id ou repo-id')
    .option('-c, --concurrency <n>', 'runs paralelos globais')
    .addOption(new Option('--tool <tool>', 'override pontual de ferramenta para esta retomada').choices(['claude', 'codex', 'opencode']))
    .option('--model <model>', 'override pontual de modelo para esta retomada')
    .addOption(new Option('--effort <effort>', 'override pontual de esforço para esta retomada').choices(['low', 'medium', 'high']))
    .action(async (target: string, opts: ResumeCliOptions) => {
      const pipeline = findResumablePipeline(target);
      if (!pipeline) {
        throw new Error(`Nenhuma pipeline retomável encontrada para "${target}".`);
      }
      if (!pipeline.cwd) {
        throw new Error(`Pipeline ${String(pipeline.id)} não possui cwd persistido para resume.`);
      }

      if (opts.tool) {
        const adapter = getAdapter(opts.tool);
        if (!adapter.isAvailable?.()) {
          throw new Error(`Ferramenta "${opts.tool}" indisponível no ambiente atual — resume abortado, nenhuma run criada.`);
        }
      }

      const snapshot = getPipelineSnapshot(pipeline);
      if (snapshot.pending.length === 0 && snapshot.active.length === 0 && snapshot.aborted.length === 0) {
        console.log(`Pipeline ${String(pipeline.id)} já concluída — nada para retomar.`);
        return;
      }

      console.log(
        `Retomando pipeline ${String(pipeline.id)} em ${pipeline.cwd}. `
          + `Reaproveita done=[${snapshot.done.join(', ') || '-'}]; `
          + `reexecuta=[${[...snapshot.active, ...snapshot.aborted, ...snapshot.pending].join(', ') || '-'}].`,
      );

      const hasOverride = Boolean(opts.tool ?? opts.model ?? opts.effort);
      const targetFeatureId = snapshot.active[0] ?? snapshot.aborted[0] ?? snapshot.pending[0];
      if (hasOverride && targetFeatureId) {
        console.log(
          `Override pontual: tool=${opts.tool ?? '-'} model=${opts.model ?? '-'} effort=${opts.effort ?? '-'} `
            + `(config persistida do backlog permanece inalterada).`,
        );
      }

      const backlog = loadBacklogFromCatalog(pipeline.repoId);
      validateBacklogSkills(backlog, pipeline.cwd);
      const concurrency = opts.concurrency
        ? Number(opts.concurrency)
        : loadConfig().concurrency;
      await executeBacklog(backlog, {
        cwd: pipeline.cwd,
        concurrency,
        resumePipelineId: pipeline.id,
        autoAdvanceStages: Boolean(pipeline.autoAdvance),
        ...(hasOverride && targetFeatureId
          ? { resumeOverride: { featureId: targetFeatureId, tool: opts.tool, model: opts.model, effort: opts.effort } }
          : {}),
      });
    });
}
