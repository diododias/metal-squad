import type { Backlog, Feature } from '../backlog/schema.js';
import { topoOrder, selectFeaturePlan } from '../orchestrator/graph.js';
import { schedule } from '../orchestrator/scheduler.js';
import { getAdapter } from '../adapters/index.js';
import { resolveRepo } from '../repo.js';
import { registerRepo, createRun, finishRun, recordUsage, cleanupStaleRuns } from '../../db/repo.js';
import { notify, subscribeToNotifications } from '../notify/telegram.js';
import { loadConfig } from '../../config/index.js';
import { buildPrompt } from '../backlog/prompt.js';
import { createSkillRegistry } from '../skills/index.js';
import { bus } from '../events/bus.js';

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
  let featureFailureEmitted = false;

  const ordered = opts.featureId
    ? selectFeaturePlan(backlog, opts.featureId)
    : topoOrder(backlog);

  const registry = createSkillRegistry();

  const execute = async (feature: Feature) => {
    const skills = registry.resolve(feature.skills ?? [], opts.cwd);
    const prompt = buildPrompt(feature, skills, opts.cwd);
    const runId = createRun(repoId, feature.id, feature.tool);
    activeRunIds.add(runId);
    bus.emit('run:start', { runId, featureId: feature.id, tool: feature.tool });
    try {
      const res = await getAdapter(feature.tool).runFeature(feature, prompt, opts.cwd, {
        onOutput: (line, stream) => bus.emit('run:output', { runId, line, stream }),
      });
      if (res.usage) {
        recordUsage(runId, res.usage);
        bus.emit('tokens:update', { runId, input: res.usage.input, output: res.usage.output });
      }
      finishRun(runId, res.ok ? 'done' : 'failed', res.summary);
      activeRunIds.delete(runId);
      if (res.ok) {
        bus.emit('run:done', { runId, result: res });
      } else {
        featureFailureEmitted = true;
        bus.emit('run:failed', { runId, error: res.summary });
      }
      return res;
    } catch (err) {
      finishRun(runId, 'failed');
      activeRunIds.delete(runId);
      const errMsg = err instanceof Error ? err.message : String(err);
      featureFailureEmitted = true;
      bus.emit('run:failed', { runId, error: errMsg });
      throw err;
    }
  };

  const handleSignal = (signal: NodeJS.Signals): void => {
    for (const runId of activeRunIds) finishRun(runId, 'failed');
    throw new Error(`Execução interrompida por ${signal}`);
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  const unsubscribeNotifications = subscribeToNotifications();

  try {
    await schedule(ordered, {
      concurrency: opts.concurrency,
      execute,
      onStart: (f) => console.log(`▶ ${f.id} (${f.tool})`),
      onDone: (f, r) => console.log(`${r.ok ? '✓' : '✗'} ${f.id} — ${r.summary}`),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!featureFailureEmitted) {
      await notify(`metal-squad: execução parada — ${msg}`);
    }
    throw err;
  } finally {
    unsubscribeNotifications();
    process.removeListener('SIGINT', handleSignal);
    process.removeListener('SIGTERM', handleSignal);
  }
}
