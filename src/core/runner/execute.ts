import type { Backlog, Feature } from '../backlog/schema.js';
import { topoOrder, selectFeaturePlan } from '../orchestrator/graph.js';
import { schedule } from '../orchestrator/scheduler.js';
import { getAdapter } from '../adapters/index.js';
import { resolveRepo } from '../repo.js';
import { registerRepo, createRun, finishRun, recordUsage, cleanupStaleRuns } from '../../db/repo.js';
import { notify } from '../notify/telegram.js';
import { loadConfig } from '../../config/index.js';
import { buildPrompt } from '../backlog/prompt.js';
import { createSkillRegistry } from '../skills/index.js';

export interface ExecuteOptions {
  cwd: string;
  concurrency: number;
  featureId?: string; // roda só uma feature
}

export async function executeBacklog(
  backlog: Backlog,
  opts: ExecuteOptions,
): Promise<void> {
  const { repoId, path } = resolveRepo(opts.cwd);
  registerRepo(repoId, path);
  cleanupStaleRuns(loadConfig().staleRunThresholdMinutes);
  const activeRunIds = new Set<number>();

  const ordered = opts.featureId
    ? selectFeaturePlan(backlog, opts.featureId)
    : topoOrder(backlog);

  const registry = createSkillRegistry();

  const execute = async (feature: Feature) => {
    const skills = registry.resolve(feature.skills ?? [], opts.cwd);
    const prompt = buildPrompt(feature, skills, opts.cwd);
    const runId = createRun(repoId, feature.id, feature.tool);
    activeRunIds.add(runId);
    try {
      const res = await getAdapter(feature.tool).runFeature(feature, prompt, opts.cwd);
      if (res.usage) recordUsage(runId, res.usage);
      finishRun(runId, res.ok ? 'done' : 'failed', res.summary);
      activeRunIds.delete(runId);
      return res;
    } catch (err) {
      finishRun(runId, 'failed');
      activeRunIds.delete(runId);
      throw err;
    }
  };

  const handleSignal = (signal: NodeJS.Signals): void => {
    for (const runId of activeRunIds) finishRun(runId, 'failed');
    throw new Error(`Execução interrompida por ${signal}`);
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  try {
    await schedule(ordered, {
      concurrency: opts.concurrency,
      execute,
      onStart: (f) => console.log(`▶ ${f.id} (${f.tool})`),
      onDone: (f, r) => console.log(`${r.ok ? "✓" : "✗"} ${f.id} — ${r.summary}`),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await notify(`metal-squad: execução parada — ${msg}`);
    throw err;
  } finally {
    process.removeListener('SIGINT', handleSignal);
    process.removeListener('SIGTERM', handleSignal);
  }
}
