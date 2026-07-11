import type { Command } from 'commander';
import { loadBacklogFromCatalog } from '../core/backlog/load.js';
import type { BacklogV2, Feature } from '../core/backlog/schema.js';
import { buildPrompt } from '../core/backlog/prompt.js';
import {
  applyDecomposedTasks,
  formatDecomposeSummary,
  readDecomposeOutput,
} from '../core/backlog/decompose.js';
import { getAdapter } from '../core/adapters/index.js';
import { createSkillRegistry } from '../core/skills/index.js';
import { loadConfig } from '../config/index.js';
import { resolveRepo } from '../core/repo.js';
import { assertWritableDbPath, DbAccessError } from '../db/index.js';
import { createRun, finishRun, recordUsage, registerRepo } from '../db/repo.js';

export function registerDecompose(program: Command): void {
  program
    .command('decompose <featureId>')
    .description('Analyze a feature and suggest an atomic task decomposition')
    .option('--apply', 'write the suggested tasks back to backlog.yaml')
    .action(async (featureId: string, opts: { apply?: boolean }) => {
      try {
        assertWritableDbPath();
        const cwd = process.cwd();
        const { repoId, path } = resolveRepo(cwd);
        const backlog = loadBacklogFromCatalog(repoId);
        const feature = findFeature(backlog, featureId);
        if (!feature) {
          throw new Error(`Feature not found in backlog: ${featureId}`);
        }

        const config = loadConfig();
        const registry = createSkillRegistry();
        const skills = registry.resolve(['decompose'], cwd);
        const prompt = buildPrompt(feature, skills, cwd, {
          maxContextChars: config.promptContextCharLimit,
        });

        registerRepo(repoId, path);
        const runId = createRun(repoId, feature.id, feature.tool, { stage: 'decompose' });

        const adapter = getAdapter(feature.tool);
        const res = await adapter.runFeature(feature, prompt, { cwd, runId });
        if (res.usage) recordUsage(runId, res.usage);

        if (!res.ok) {
          finishRun(runId, 'failed', res.summary);
          throw new Error(`decompose run failed: ${res.summary}`);
        }
        finishRun(runId, 'done', res.summary);

        const output = readDecomposeOutput(feature.id, cwd);
        console.log(formatDecomposeSummary(feature.id, output));

        if (opts.apply) {
          const count = applyDecomposedTasks(feature.id, output.tasks, cwd);
          console.log(`\nbacklog.yaml updated: ${String(count)} tasks applied to ${feature.id}.`);
          console.log('Rode "msq backlog load" para publicar essas mudancas no catalogo.');
        } else {
          console.log('\nRun again with --apply to update backlog.yaml.');
        }
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

function findFeature(backlog: BacklogV2, featureId: string): Feature | null {
  for (const epic of backlog.epics) {
    for (const feature of epic.features) {
      if (feature.id === featureId) return feature;
    }
  }
  return null;
}
