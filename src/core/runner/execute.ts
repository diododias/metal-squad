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
  getPipeline,
  getPipelineSnapshot,
  getStageRequest,
  listStageRequestsForFeature,
  pausePipeline,
  recordUsage,
  resumePipeline,
  setPipelineStatus,
  cleanupStaleRuns,
  updatePipelineSnapshot,
  updatePipelineStage,
  type PipelineStatus,
  type StageRequestRow,
} from '../../db/repo.js';
import { dispatch } from '../notify/manager.js';
import { startTelegramPoller, stopTelegramPoller } from '../notify/telegram-poller.js';
import { loadConfig } from '../../config/index.js';
import { buildPrompt } from '../backlog/prompt.js';
import { createSkillRegistry } from '../skills/index.js';
import { syncFeatureTasksToBacklog } from '../backlog/sync.js';
import type { Skill } from '../skills/types.js';
import {
  createBudgetTracker,
  formatBudgetViolation,
  resolveBudgetLimits,
  type BudgetViolation,
} from '../budget/tracker.js';
import {
  attachDefaultEventLogger,
  attachEventNotifications,
  attachRunPersistence,
  msqEventBus,
} from '../events/index.js';
import { loadBudgetState, saveBudgetState } from '../../db/repo.js';
import { saveConfig } from '../../config/index.js';

const SYSTEM_STAGE_SKILLS: Record<string, string[]> = {
  specify: ['speckit-specify'],
  plan: ['speckit-plan'],
  tasks: ['speckit-tasks'],
  implement: ['speckit-implement', 'dev-flow'],
  validate: ['reviewr'],
};

export interface ExecuteOptions {
  cwd: string;
  concurrency: number;
  featureId?: string;
  autoAdvanceStages?: boolean;
  resumePipelineId?: number;
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
  const activeControllers = new Map<string, AbortController>();
  const budget = createBudgetTracker(resolveBudgetLimits(
    backlog.version === 2 ? backlog.budget : undefined,
    config.budget,
  ), {
    config,
    saveConfig,
    loadState: loadBudgetState,
    saveState: saveBudgetState,
  });
  let budgetPauseTriggered = false;

  const repoStageSkills = backlog.version === 2 ? backlog.defaults.stageSkills : {};
  const effectiveStageSkills: Record<string, string[]> = {
    ...SYSTEM_STAGE_SKILLS,
    ...config.stageSkills,
    ...repoStageSkills,
  };

  const resolvedPlan = opts.featureId
    ? selectFeaturePlan(backlog, opts.featureId)
    : topoOrder(backlog);
  const initialSnapshot = {
    plan: resolvedPlan.map((feature) => feature.id),
    done: [] as string[],
    pending: resolvedPlan.map((feature) => feature.id),
    active: [] as string[],
    aborted: [] as string[],
  };

  const pipelineId = opts.resumePipelineId
    ? ((): number => {
        const existing = getPipeline(opts.resumePipelineId);
        if (!existing) throw new Error(`Pipeline ${String(opts.resumePipelineId)} not found for resume.`);
        resumePipeline(existing.id);
        return existing.id;
      })()
    : createPipeline(
        repoId,
        opts.featureId ?? resolvedPlan[resolvedPlan.length - 1]?.id ?? 'backlog',
        Boolean(opts.autoAdvanceStages),
        { cwd: opts.cwd, snapshot: initialSnapshot },
      );
  const persistedPipeline = getPipeline(pipelineId);
  if (!persistedPipeline) {
    throw new Error(`Pipeline ${String(pipelineId)} could not be loaded after creation.`);
  }
  const persistedSnapshot = getPipelineSnapshot(persistedPipeline);
  const initialDone = new Set(persistedSnapshot.done);
  const remainingIds = new Set([
    ...persistedSnapshot.pending,
    ...persistedSnapshot.active,
    ...persistedSnapshot.aborted,
  ]);
  const ordered = resolvedPlan.filter((feature) => remainingIds.has(feature.id));

  const registry = createSkillRegistry();
  const detachPersistence = attachRunPersistence();
  const detachLogger = attachDefaultEventLogger();
  const detachNotifications = attachEventNotifications();
  startTelegramPoller();

  const handleGlobalBudgetViolation = (violation: BudgetViolation, featureId: string): void => {
    if (budgetPauseTriggered) return;
    budgetPauseTriggered = true;
    const gateRunId = createRun(repoId, featureId, 'budget', { pipelineId });
    finishRun(gateRunId, 'blocked', formatBudgetViolation(violation));
    createGate(gateRunId, featureId, repoId);
    pausePipeline(pipelineId);
    msqEventBus.emit('budget:alert', {
      percent: 100,
      spent: Math.round(violation.spent * 100) / 100,
      limit: violation.limit,
    });
  };

  const applyBudgetUsage = (feature: Feature, usage: NonNullable<RunResult['usage']>, runId: number): void => {
    const { violations, alerts } = budget.record(feature.id, usage);
    for (const alert of alerts) {
      msqEventBus.emit('budget:alert', {
        percent: alert.percent,
        spent: Math.round(alert.spent * 100) / 100,
        limit: alert.limit,
      });
    }
    for (const violation of violations) {
      if (violation.scope === 'global') {
        handleGlobalBudgetViolation(violation, feature.id);
      } else {
        createGate(runId, feature.id, repoId);
      }
    }
  };

  const executeStageRun = async (
    feature: Feature,
    prompt: string,
    stage?: string,
    abortSignal?: AbortSignal,
  ): Promise<{ runId: number; res: RunResult }> => {
    const runId = createRun(repoId, feature.id, feature.tool, { pipelineId, stage });
    activeRunIds.add(runId);
    msqEventBus.emit('run:start', { runId, featureId: feature.id, tool: feature.tool, stage });
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
        signal: abortSignal,
      });
      if (res.usage) {
        recordUsage(runId, res.usage);
        applyBudgetUsage(feature, res.usage, runId);
      }

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

      if (res.aborted) {
        finishRun(runId, 'aborted', res.summary);
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
          error: res.summary,
        });
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

  const execute = async (feature: Feature): Promise<RunResult> => {
    const violation = budget.globalViolation();
    if (violation) {
      handleGlobalBudgetViolation(violation, feature.id);
      return {
        ok: false,
        aborted: true,
        summary: formatBudgetViolation(violation),
      };
    }
    const controller = new AbortController();
    activeControllers.set(feature.id, controller);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- workflow set by Zod default, but callers may pass raw objects
    if (feature.workflow?.mode === 'staged') {
      try {
        return await executeStagedFeature(
          feature,
          pipelineId,
          registry,
          config,
          opts,
          executeStageRun,
          effectiveStageSkills,
          controller.signal,
        );
      } finally {
        activeControllers.delete(feature.id);
      }
    }

    const skills = registry.resolve(feature.skills ?? [], opts.cwd);
    const prompt = buildPrompt(feature, skills, opts.cwd, {
      maxContextChars: config.promptContextCharLimit,
    });
    try {
      const { res } = await executeStageRun(feature, prompt, undefined, controller.signal);
      return res;
    } finally {
      activeControllers.delete(feature.id);
    }
  };

  const handleSignal = (signal: NodeJS.Signals): void => {
    setPipelineStatus(pipelineId, 'aborting');
    for (const controller of activeControllers.values()) controller.abort();
    for (const runId of activeRunIds) finishRun(runId, 'aborted');
    throw new Error(`Execution interrupted by ${signal}`);
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  const scheduler = schedule(ordered, {
    concurrency: opts.concurrency,
    initialDone,
    execute,
    onStateChange: (state) => {
      if (state === 'paused') pausePipeline(pipelineId);
      if (state === 'running') setPipelineStatus(pipelineId, 'running');
      if (state === 'aborting') setPipelineStatus(pipelineId, 'aborting');
    },
    onAbortFeature: (featureId) => {
      activeControllers.get(featureId)?.abort();
    },
    onStart: (feature) => {
      const current = getPipeline(pipelineId);
      if (!current) return;
      const snapshot = getPipelineSnapshot(current);
      updatePipelineSnapshot(pipelineId, {
        pending: snapshot.pending.filter((item) => item !== feature.id),
        active: [...snapshot.active.filter((item) => item !== feature.id), feature.id],
        aborted: snapshot.aborted.filter((item) => item !== feature.id),
      }, {
        status: current.status === 'paused' ? 'paused' : 'running',
      });
    },
    onDone: (feature, result) => {
      const current = getPipeline(pipelineId);
      if (!current) return;
      const snapshot = getPipelineSnapshot(current);
      const withoutActive = snapshot.active.filter((item) => item !== feature.id);
      if (result.aborted) {
        updatePipelineSnapshot(pipelineId, {
          active: withoutActive,
          aborted: [...snapshot.aborted.filter((item) => item !== feature.id), feature.id],
        }, {
          status: current.status === 'aborting' ? 'aborting' : 'paused',
          clearAbortRequest: true,
        });
        return;
      }
      const shouldCountAsDone = result.ok || getOnFailPolicy(feature) === 'continue';
      updatePipelineSnapshot(pipelineId, {
        active: withoutActive,
        done: shouldCountAsDone
          ? [...snapshot.done.filter((item) => item !== feature.id), feature.id]
          : snapshot.done,
        pending: snapshot.pending.filter((item) => item !== feature.id),
        aborted: snapshot.aborted.filter((item) => item !== feature.id),
      }, {
        clearAbortRequest: true,
      });
    },
  });

  const controlPoller = setInterval(() => {
    const current = getPipeline(pipelineId);
    if (!current) return;
    if (current.status === 'paused') {
      scheduler.pause();
    } else if (current.status === 'running') {
      scheduler.resume();
    } else if (current.status === 'aborting') {
      scheduler.abortAll();
    }
    if (current.requestedAbortFeatureId) {
      const aborted = scheduler.abortFeature(current.requestedAbortFeatureId);
      if (!aborted) {
        updatePipelineSnapshot(pipelineId, {}, { clearAbortRequest: true });
      }
    }
  }, 250);

  try {
    const outcome = await scheduler.result;
    if (outcome === 'completed') {
      finishPipeline(pipelineId, 'done');
      return;
    }
    finishPipeline(pipelineId, 'aborted');
  } catch (err) {
    const pipelineStatus = derivePipelineFailureStatus(err);
    finishPipeline(pipelineId, pipelineStatus);
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.startsWith('Feature ')) {
      void dispatch('run:failed', `metal-squad: execution stopped — ${msg}`).catch(() => { /* ignore dispatch errors */ });
    }
    throw err;
  } finally {
    clearInterval(controlPoller);
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
  abortSignal?: AbortSignal,
) => Promise<{
  runId: number;
  res: RunResult;
}>;

interface RetryRunOptions {
  cwd: string;
  runId: number;
  repoId: string;
  signal?: AbortSignal;
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
      signal: opts.signal,
    });

    if (res.ok || res.control?.type === 'needs_input') return res;

    lastResult = res;

    if (attempt < maxAttempts) {
      const waitMs = backoffWithJitter(backoffMs, attempt);
      createRetryRecord(opts.runId, attempt, res.summary, waitMs);
      await sleep(waitMs);
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
  pipelineId: number,
  registry: ReturnType<typeof createSkillRegistry>,
  config: ReturnType<typeof loadConfig>,
  opts: ExecuteOptions,
  executeStageRun: StageExecutor,
  stageSkills: Record<string, string[]>,
  abortSignal?: AbortSignal,
): Promise<RunResult> {
  const workflow = feature.workflow;
  const autoAdvance = (opts.autoAdvanceStages ?? workflow.approvals.autoAdvance) || config.workflow.autoAdvanceStages;
  const stages = workflow.stages;
  const persistedRequests = listStageRequestsForFeature(pipelineId, feature.id);
  const stageInputs = loadPersistedStageInputs(persistedRequests);
  const startIndex = determineStageStartIndex(
    stages,
    getPipeline(pipelineId)?.currentStage ?? null,
    persistedRequests,
    Boolean(opts.resumePipelineId),
  );

  for (let index = startIndex; index < stages.length; index += 1) {
    const stage = stages[index] ?? 'implement';
    updatePipelineStage(pipelineId, stage);
    const stageSkillList = resolveStageSkill(feature, stage, registry, opts.cwd, stageSkills);
    const prompt = buildStagePrompt(feature, stage, stageSkillList, opts.cwd, config.promptContextCharLimit, stageInputs.get(stage) ?? []);
    const { runId, res } = await executeStageRun(feature, prompt, stage, abortSignal);

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
      return {
        ...res,
        summary: `${stage}: ${res.summary}`,
      };
    }

    const shouldSyncTasks = workflow.syncTasksToBacklog && (stage === 'tasks' || stage === 'plan');
    if (shouldSyncTasks) {
      try {
        const tasksFile = resolveGeneratedTasksFile(feature, opts.cwd);
        syncFeatureTasksToBacklog(feature.id, tasksFile, opts.cwd);
      } catch {
        // tasks file not yet generated — skip silently
      }
    }

    const hasNextStage = index < stages.length - 1;
    if (!hasNextStage) continue;

    if (autoAdvance) {
      createStageRequest(
        pipelineId,
        feature.id,
        stage,
        'approval',
        `Auto-advance enabled; next stage: ${stages[index + 1] ?? 'done'}.`,
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
      `Advance to stage ${stages[index + 1] ?? 'done'}?`,
      { runId },
    );
    const decision = await waitForStageApproval(
      requestId,
      pipelineId,
      feature.id,
      stage,
      stages[index + 1] ?? 'done',
      config.workflow.pollIntervalMs,
      runId,
    );
    if (decision === 'retry') {
      index -= 1;
      continue;
    }
  }

  return {
    ok: true,
    summary: `staged workflow completed (${stages.join(' -> ')})`,
  };
}

function resolveStageSkill(
  feature: Feature,
  stage: string,
  registry: ReturnType<typeof createSkillRegistry>,
  cwd: string,
  stageSkills: Record<string, string[]>,
): Skill[] {
  const mappedNames = stageSkills[stage];
  if (mappedNames && mappedNames.length > 0) {
    const resolved = registry.resolve(mappedNames, cwd);
    if (resolved.length > 0) return resolved;
  }

  const byName = registry.resolve([stage], cwd);
  if (byName.length > 0) return byName;

  return [];
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
  const stageContext: string[] = [];
  if (stage === 'specify') {
    const specifyDescription = buildSpecifyStageDescription(feature, cwd, maxContextChars);
    if (specifyDescription) {
      stageContext.push([
        'Treat the following block as the exact feature description passed to `/speckit-specify`:',
        specifyDescription,
      ].join('\n'));
    }
  }
  if (adminInputs.length > 0) {
    stageNotes.push(`Admin inputs already collected for this stage:\n- ${adminInputs.join('\n- ')}`);
  }

  const appendedSections = [stageNotes.join('\n'), ...stageContext].filter((section) => section.trim().length > 0);
  return `${basePrompt}\n\n---\n\n${appendedSections.join('\n\n')}`.trim();
}

function buildSpecifyStageDescription(
  feature: Feature,
  cwd: string,
  maxContextChars: number,
): string | null {
  const parts = [`Feature: ${feature.title}`];

  if (feature.spec?.trim()) {
    parts.push(`Summary:\n${feature.spec.trim()}`);
  }

  if (feature.specFile && existsSync(resolve(cwd, feature.specFile))) {
    const specFileContent = truncateForStageContext(readFileSync(resolve(cwd, feature.specFile), 'utf8'), maxContextChars);
    if (specFileContent) {
      parts.push(`Existing feature brief from ${feature.specFile}:\n${specFileContent}`);
    }
  }

  return parts.join('\n\n').trim() || null;
}

function truncateForStageContext(content: string, maxChars: number): string | null {
  if (!content) return null;
  if (content.length <= maxChars) return content;

  const notice = '\n\n[truncated to respect promptContextCharLimit]';
  const sliceLength = Math.max(0, maxChars - notice.length);
  return `${content.slice(0, sliceLength)}${notice}`.trim();
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

  throw new Error(`Could not locate generated tasks.md for ${feature.id}`);
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
      `Stage ${stage} still pending. Advance to ${nextStage}?`,
      { runId },
    );
  }
}

function loadPersistedStageInputs(
  requests: StageRequestRow[],
): Map<string, string[]> {
  const inputs = new Map<string, string[]>();
  for (const request of requests) {
    if (request.kind !== 'input' || request.status !== 'resolved' || !request.response) continue;
    inputs.set(request.stage, [...(inputs.get(request.stage) ?? []), request.response]);
  }
  return inputs;
}

function determineStageStartIndex(
  stages: string[],
  currentStage: string | null,
  requests: StageRequestRow[],
  isResume: boolean,
): number {
  if (!isResume || !currentStage) return 0;
  const currentIndex = stages.indexOf(currentStage);
  if (currentIndex === -1) return 0;

  const latestRequest = [...requests]
    .filter((request) => request.stage === currentStage)
    .at(-1);
  if (!latestRequest) return currentIndex;

  if (latestRequest.kind === 'approval' && latestRequest.status === 'resolved') {
    if (latestRequest.response === 'advance') return Math.min(currentIndex + 1, stages.length - 1);
    return currentIndex;
  }

  return currentIndex;
}

function getOnFailPolicy(feature: Feature): OnFail {
  return feature.retry?.onFail ?? 'stop';
}

function derivePipelineFailureStatus(error: unknown): PipelineStatus {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('abort')) return 'aborted';
  if (message.includes('blocked')) return 'blocked';
  return 'failed';
}

export function backoffWithJitter(baseMs: number, attempt: number): number {
  const exp = Math.min(baseMs * 2 ** (attempt - 1), 60_000);
  return exp * (0.5 + Math.random() * 0.5);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
