import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import type { Backlog, Feature, OnFail } from '../backlog/schema.js';
import type { RunResult } from '../adapters/types.js';
import { topoOrder, selectFeaturePlan } from '../orchestrator/graph.js';
import { schedule } from '../orchestrator/scheduler.js';
import { getAdapter } from '../adapters/index.js';
import { resolveRepo } from '../repo.js';
import {
  registerRepo,
  createPipeline,
  createRun,
  createStageRequest,
  createGate,
  createRetryRecord,
  finishPipeline,
  finishRun,
  getStageRequest,
  recordUsage,
  cleanupStaleRuns,
  updatePipelineStage,
} from '../../db/repo.js';
import { dispatch } from '../notify/manager.js';
import { startTelegramPoller, stopTelegramPoller } from '../notify/telegram-poller.js';
import { loadConfig } from '../../config/index.js';
import { buildPrompt } from '../backlog/prompt.js';
import { createSkillRegistry } from '../skills/index.js';
import { syncFeatureTasksToBacklog } from '../backlog/sync.js';
import type { Skill } from '../skills/types.js';
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
  autoAdvanceStages?: boolean;
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

  const executeStageRun = async (
    feature: Feature,
    prompt: string,
    stage?: string,
    pipelineId?: number,
  ) => {
    const runId = createRun(repoId, feature.id, feature.tool, { pipelineId, stage });
    activeRunIds.add(runId);
    msqEventBus.emit('run:start', { runId, featureId: feature.id, tool: feature.tool });
    if (stage) {
      msqEventBus.emit('task:started', {
        runId,
        featureId: feature.id,
        taskId: stage,
        title: stage,
        stage,
      });
    }
    try {
      const res = await runWithRetry(feature, prompt, {
        cwd: opts.cwd,
        runId,
        repoId,
      });
      if (res.usage) recordUsage(runId, res.usage);

      if (res.control?.type === 'needs_input') {
        finishRun(runId, 'blocked', res.summary);
        if (stage) {
          msqEventBus.emit('task:updated', {
            runId,
            featureId: feature.id,
            taskId: stage,
            status: 'blocked',
            stage,
            endedAt: new Date().toISOString(),
          });
        }
        activeRunIds.delete(runId);
        return { runId, res };
      }

      const failurePolicy = getOnFailPolicy(feature);
      const status = res.ok ? 'done' : failurePolicy === 'gate' ? 'blocked' : 'failed';
      finishRun(runId, status, res.summary);
      if (stage) {
        msqEventBus.emit('task:updated', {
          runId,
          featureId: feature.id,
          taskId: stage,
          status,
          stage,
          endedAt: new Date().toISOString(),
        });
      }
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
      return { runId, res };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      finishRun(runId, 'failed');
      if (stage) {
        msqEventBus.emit('task:updated', {
          runId,
          featureId: feature.id,
          taskId: stage,
          status: 'failed',
          stage,
          endedAt: new Date().toISOString(),
        });
      }
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

  const execute = async (feature: Feature) => {
    if (feature.workflow?.mode === 'staged') {
      return executeStagedFeature(
        feature,
        repoId,
        registry,
        config,
        opts,
        executeStageRun,
      );
    }

    const skills = registry.resolve(feature.skills ?? [], opts.cwd);
    const prompt = buildPrompt(feature, skills, opts.cwd, {
      maxContextChars: config.promptContextCharLimit,
    });
    const { res } = await executeStageRun(feature, prompt);
    return res;
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

type StageExecutor = (
  feature: Feature,
  prompt: string,
  stage?: string,
  pipelineId?: number,
) => Promise<{
  runId: number;
  res: RunResult;
}>;

interface RetryRunOptions {
  cwd: string;
  runId: number;
  repoId: string;
}

async function runWithRetry(
  feature: Feature,
  prompt: string,
  opts: RetryRunOptions,
): Promise<RunResult> {
  const adapter = getAdapter(feature.tool);
  const maxAttempts = feature.retry?.maxAttempts ?? 1;
  const backoffMs = feature.retry?.backoffMs ?? 5000;
  let lastResult: RunResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await adapter.runFeature(feature, prompt, {
      cwd: opts.cwd,
      runId: opts.runId,
    });

    if (res.ok || res.control?.type === 'needs_input') return res;

    lastResult = res;

    if (attempt < maxAttempts) {
      createRetryRecord(opts.runId, attempt, res.summary);
      await sleep(backoffWithJitter(backoffMs, attempt));
    }
  }

  if (!lastResult) {
    throw new Error(`Feature ${feature.id} did not produce a run result.`);
  }

  if (getOnFailPolicy(feature) === 'gate') {
    createGate(opts.runId, feature.id, opts.repoId);
  }

  return lastResult;
}

async function executeStagedFeature(
  feature: Feature,
  repoId: string,
  registry: ReturnType<typeof createSkillRegistry>,
  config: ReturnType<typeof loadConfig>,
  opts: ExecuteOptions,
  executeStageRun: StageExecutor,
) {
  const workflow = feature.workflow;
  if (!workflow) {
    throw new Error(`Feature ${feature.id} configured as staged but workflow is missing.`);
  }

  const autoAdvance = opts.autoAdvanceStages || workflow.approvals.autoAdvance || config.workflow.autoAdvanceStages;
  const pipelineId = createPipeline(repoId, feature.id, autoAdvance);
  const stageInputs = new Map<string, string[]>();
  const stages = workflow.stages;

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index] ?? 'implement';
    updatePipelineStage(pipelineId, stage);
    const stageSkill = resolveStageSkill(feature, stage, registry, opts.cwd);
    const prompt = buildStagePrompt(feature, stage, stageSkill, opts.cwd, config.promptContextCharLimit, stageInputs.get(stage) ?? []);
    const { runId, res } = await executeStageRun(feature, prompt, stage, pipelineId);

    if (res.control?.type === 'needs_input') {
      const requestId = createStageRequest(
        pipelineId,
        feature.id,
        stage,
        'input',
        res.control.prompt,
        { runId },
      );
      const response = await waitForStageRequestResponse(requestId, config.workflow.pollIntervalMs);
      stageInputs.set(stage, [...(stageInputs.get(stage) ?? []), response]);
      index -= 1;
      continue;
    }

    if (!res.ok) {
      finishPipeline(pipelineId, getOnFailPolicy(feature) === 'gate' ? 'blocked' : 'failed');
      return {
        ...res,
        summary: `${stage}: ${res.summary}`,
      };
    }

    if (stage === 'tasks' && workflow.syncTasksToBacklog) {
      const tasksFile = resolveGeneratedTasksFile(feature, opts.cwd);
      syncFeatureTasksToBacklog(feature.id, tasksFile, opts.cwd);
    }

    const hasNextStage = index < stages.length - 1;
    if (!hasNextStage) continue;

    if (autoAdvance) {
      createStageRequest(
        pipelineId,
        feature.id,
        stage,
        'approval',
        `Auto-advance habilitado; proxima etapa: ${stages[index + 1] ?? 'fim'}.`,
        {
          runId,
          response: 'advance',
          source: 'auto',
        },
      );
      continue;
    }

    const requestId = createStageRequest(
      pipelineId,
      feature.id,
      stage,
      'approval',
      `Avancar para a etapa ${stages[index + 1] ?? 'fim'}?`,
      { runId },
    );
    const decision = await waitForStageApproval(
      requestId,
      pipelineId,
      feature.id,
      stage,
      stages[index + 1] ?? 'fim',
      config.workflow.pollIntervalMs,
      runId,
    );
    if (decision === 'retry') {
      index -= 1;
      continue;
    }
  }

  finishPipeline(pipelineId, 'done');
  return {
    ok: true,
    summary: `workflow staged concluido (${stages.join(' -> ')})`,
  };
}

function resolveStageSkill(
  feature: Feature,
  stage: string,
  registry: ReturnType<typeof createSkillRegistry>,
  cwd: string,
): Skill[] {
  const skills = registry.resolve([stage], cwd);
  if (skills.length > 0) return skills;
  if (stage === 'implement') return [];
  throw new Error(`Stage skill not found for ${feature.id}: ${stage}`);
}

function buildStagePrompt(
  feature: Feature,
  stage: string,
  skills: Skill[],
  cwd: string,
  maxContextChars: number,
  adminInputs: string[],
): string {
  const basePrompt = buildPrompt(feature, skills, cwd, { maxContextChars });
  const stageNotes = [
    `Current workflow stage: ${stage}.`,
    'Run only this stage in this session.',
    'Do not continue to later stages after finishing the current stage.',
    'If you need admin input, end your final response with exactly: MSQ_INPUT_REQUIRED: <question>',
  ];
  if (adminInputs.length > 0) {
    stageNotes.push(`Admin inputs already collected for this stage:\n- ${adminInputs.join('\n- ')}`);
  }

  return `${basePrompt}\n\n---\n\n${stageNotes.join('\n')}`.trim();
}

function resolveGeneratedTasksFile(feature: Feature, cwd: string): string {
  const featureJsonPath = resolve(cwd, '.specify', 'feature.json');
  if (existsSync(featureJsonPath)) {
    const parsed = JSON.parse(readFileSync(featureJsonPath, 'utf8')) as {
      feature_directory?: string;
      featureDir?: string;
    };
    const featureDir = parsed.feature_directory ?? parsed.featureDir;
    if (featureDir) {
      const candidate = resolve(cwd, featureDir, 'tasks.md');
      if (existsSync(candidate)) return candidate;
    }
  }

  if (feature.specFile) {
    const candidate = resolve(cwd, dirname(feature.specFile), 'tasks.md');
    if (existsSync(candidate)) return candidate;
  }

  const fallback = join(cwd, 'tasks.md');
  if (existsSync(fallback)) return fallback;

  throw new Error(`Nao foi possivel localizar o tasks.md gerado para ${feature.id}`);
}

async function waitForStageRequestResponse(requestId: number, pollIntervalMs: number): Promise<string> {
  for (;;) {
    const request = getStageRequest(requestId);
    if (request?.status === 'resolved' && request.response) return request.response;
    await sleep(pollIntervalMs);
  }
}

async function waitForStageApproval(
  requestId: number,
  pipelineId: number,
  featureId: string,
  stage: string,
  nextStage: string,
  pollIntervalMs: number,
  runId: number,
): Promise<'advance' | 'retry'> {
  let pendingRequestId = requestId;

  for (;;) {
    const response = await waitForStageRequestResponse(pendingRequestId, pollIntervalMs);
    if (response === 'advance' || response === 'retry') return response;
    pendingRequestId = createStageRequest(
      pipelineId,
      featureId,
      stage,
      'approval',
      `Etapa ${stage} mantida em espera. Avancar para ${nextStage}?`,
      { runId },
    );
  }
}

function getOnFailPolicy(feature: Feature): OnFail {
  return feature.retry?.onFail ?? 'stop';
}

export function backoffWithJitter(baseMs: number, attempt: number): number {
  const exp = Math.min(baseMs * 2 ** (attempt - 1), 60_000);
  return exp * (0.5 + Math.random() * 0.5);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
