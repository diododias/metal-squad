import type { Backlog, Feature } from '../backlog/schema.js';
import { topoOrder } from '../orchestrator/graph.js';
import { schedule } from '../orchestrator/scheduler.js';
import { getAdapter } from '../adapters/index.js';
import { resolveRepo } from '../repo.js';
import { registerRepo, createRun, finishRun, recordUsage } from '../../db/repo.js';
import { notify } from '../notify/telegram.js';

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

  let ordered = topoOrder(backlog);
  if (opts.featureId) ordered = ordered.filter((f) => f.id === opts.featureId);

  const execute = async (feature: Feature) => {
    const runId = createRun(repoId, feature.id, feature.tool);
    try {
      const res = await getAdapter(feature.tool).runFeature(feature, opts.cwd);
      if (res.usage) recordUsage(runId, res.usage);
      finishRun(runId, res.ok ? 'done' : 'failed', res.summary);
      return res;
    } catch (err) {
      finishRun(runId, 'failed');
      throw err;
    }
  };

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
  }
}
