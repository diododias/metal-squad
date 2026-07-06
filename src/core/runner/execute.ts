import type { Backlog, Feature } from '../backlog/schema.js';
import { topoOrder, selectFeaturePlan } from '../orchestrator/graph.js';
import { schedule } from '../orchestrator/scheduler.js';
import { getAdapter } from '../adapters/index.js';
import { resolveRepo } from '../repo.js';
import { registerRepo, createRun, finishRun, recordUsage, cleanupStaleRuns } from '../../db/repo.js';
import { dispatch } from '../notify/manager.js';
import { startTelegramPoller, stopTelegramPoller } from '../notify/telegram-poller.js';
import { loadConfig } from '../../config/index.js';
import { buildPrompt } from '../backlog/prompt.js';
import { createSkillRegistry } from '../skills/index.js';
import {
  attachDefaultEventLogger,
  attachEventNotifications,
  attachRunPersistence,
  msqEventBus,
} from '../events/index.js';

export interface ExecuteOptions {
  cwd: string;
  concurrency: number;
  featureId?: string; // roda só uma feature
}

export async function executeBacklog(
  backlog: Backlog,
  opts: ExecuteOptions,
): Promise<void> {
  const config = loadConfig();
  const { repoId, path } = resolveRepo(opts.cwd);
  registerRepo(repoId, path);
  cleanupStaleRuns(config.staleRunThresholdMinutes);
  const activeRunIds = new Set<number>();

  const ordered = opts.featureId
    ? selectFeaturePlan(backlog, opts.featureId)
    : topoOrder(backlog);

  const registry = createSkillRegistry();
  const detachPersistence = attachRunPersistence();
  const detachLogger = attachDefaultEventLogger();
  const detachNotifications = attachEventNotifications();
  startTelegramPoller();

  const execute = async (feature: Feature) => {
    const skills = registry.resolve(feature.skills ?? [], opts.cwd);
    const prompt = buildPrompt(feature, skills, opts.cwd, {
      maxContextChars: config.promptContextCharLimit,
    });
    const runId = createRun(repoId, feature.id, feature.tool);
    activeRunIds.add(runId);
    msqEventBus.emit('run:start', { runId, featureId: feature.id, tool: feature.tool });
    try {
      const res = await getAdapter(feature.tool).runFeature(feature, prompt, {
        cwd: opts.cwd,
        runId,
      });
      if (res.usage) recordUsage(runId, res.usage);
      finishRun(runId, res.ok ? 'done' : 'failed', res.summary);
      if (res.ok) {
        msqEventBus.emit('run:done', {
          runId,
          featureId: feature.id,
          tool: feature.tool,
          result: res,
        });
      } else {
        msqEventBus.emit('run:failed', {
          runId,
          featureId: feature.id,
          tool: feature.tool,
          error: res.summary,
        });
      }
      activeRunIds.delete(runId);
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      finishRun(runId, 'failed');
      msqEventBus.emit('run:failed', {
        runId,
        featureId: feature.id,
        tool: feature.tool,
        error: message,
      });
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
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.startsWith('Feature ')) {
      void dispatch('run:failed', `metal-squad: execução parada — ${msg}`).catch(() => {});
    }
    throw err;
  } finally {
    stopTelegramPoller();
    detachNotifications();
    detachLogger();
    detachPersistence();
    process.removeListener('SIGINT', handleSignal);
    process.removeListener('SIGTERM', handleSignal);
  }
}
