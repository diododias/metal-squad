import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import type { Backlog, Effort, Feature, OnFail, Tool } from '../backlog/schema.js';
import type { RunFeatureOptions, RunResult } from '../adapters/types.js';
import { topoOrder, selectStartableFeaturePlan } from '../orchestrator/graph.js';
import { schedule } from '../orchestrator/scheduler.js';
import {
  classifyBlockedOutcome,
  classifyFailedOutcome,
  classifySuccessOutcome,
  buildAutoPilotDecision,
  selectNextAutoStartCandidate,
  shouldEvaluateNextCandidate,
} from '../orchestrator/autoPilot.js';
import type { AutoPilotOutcomeKind } from '../events/types.js';
import { getAdapter } from '../adapters/index.js';
import { resolveRepo } from '../repo.js';
import {
  registerRepo,
  createPipeline,
  createRun,
  createStageRequest,
  createStageTransitionDecision,
  createGate,
  createRetryRecord,
  createTimeoutApprovalRequest,
  createTimeoutOccurrence,
  finishPipeline,
  finishRun,
  getRunContextTelemetry,
  getPipeline,
  getPipelineSnapshot,
  getStageRequest,
  listCompletedFeatureIds,
  listRunsForTui,
  listStageRequestsForFeature,
  pausePipeline,
  recordUsage,
  resumePipeline,
  setPipelineStatus,
  cleanupStaleRuns,
  updatePipelineSnapshot,
  updatePipelineStage,
  updateRunTool,
  updateStageTransitionDecisionNextSessionId,
  type PipelineStatus,
  type PipelineWorkflowRevisions,
  type StageRequestRow,
} from '../../db/repo.js';
import { getCatalogFeature } from '../../db/backlogCatalog.js';
import { dispatch } from '../notify/manager.js';
import { startTelegramPoller, stopTelegramPoller } from '../notify/telegram-poller.js';
import { resolveRuntimeConfig } from '../../config/index.js';
import { buildPrompt } from '../backlog/prompt.js';
import { createSkillRegistry } from '../skills/index.js';
import { syncFeatureTasksToBacklog } from '../backlog/sync.js';
import type { Skill } from '../skills/types.js';
import { collectEffectiveStageSkills } from '../workflow/stageSkills.js';
import { decideStageTransition } from '../workflow/sessionPolicy.js';
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
import { verifyPublishContract } from '../git/publish.js';
import { updateRunPublishState } from '../../db/repo.js';

export interface ResumeOverride {
  featureId: string;
  tool?: Tool;
  model?: string;
  effort?: Effort;
}

export interface ExecuteOptions {
  cwd: string;
  concurrency: number;
  featureId?: string;
  autoAdvanceStages?: boolean;
  resumePipelineId?: number;
  resumeOverride?: ResumeOverride;
}

function captureWorkflowRevisions(features: Feature[]): PipelineWorkflowRevisions {
  return Object.fromEntries(features.map((feature) => [feature.id, {
    mode: feature.workflow.mode,
    stages: [...feature.workflow.stages],
    syncTasksToBacklog: feature.workflow.syncTasksToBacklog,
    sessionPolicy: {
      ...feature.workflow.sessionPolicy,
      alwaysIsolatedStages: [...feature.workflow.sessionPolicy.alwaysIsolatedStages],
    },
    stepGuidance: Object.fromEntries(Object.entries(
      Object.hasOwn(feature.workflow, 'stepGuidance') ? feature.workflow.stepGuidance : {},
    ).map(([stage, guidance]) => [stage, {
      ...guidance,
      ...(guidance.skills ? { skills: [...guidance.skills] } : {}),
    }])),
  }]));
}

function applyWorkflowRevisions(features: Feature[], revisions: PipelineWorkflowRevisions | undefined): Feature[] {
  if (!revisions || Object.keys(revisions).length === 0) return features;
  return features.map((feature) => {
    const revision = revisions[feature.id];
    if (!revision) return feature;
    return {
      ...feature,
      workflow: {
        ...revision,
        // Approval transitions are intentionally resolved from the current
        // catalog, even when the structural workflow is frozen for resume.
        approvals: feature.workflow.approvals,
      },
    };
  });
}

export function rehydrateBacklogWorkflowRevisions<T extends Backlog>(
  backlog: T,
  revisions: PipelineWorkflowRevisions | undefined,
): T {
  if (!revisions || Object.keys(revisions).length === 0) return backlog;
  return {
    ...backlog,
    epics: backlog.epics.map((epic) => ({
      ...epic,
      features: applyWorkflowRevisions(epic.features, revisions),
    })),
  };
}

export async function executeBacklog(
  backlog: Backlog,
  opts: ExecuteOptions,
): Promise<void> {
  const config = resolveRuntimeConfig(opts.cwd);
  const { repoId, path } = resolveRepo(opts.cwd);
  registerRepo(repoId, path);
  cleanupStaleRuns(config.staleRunThresholdMinutes);
  const activeRunIds = new Set<number>();
  const activeControllers = new Map<string, AbortController>();
  const lastRunIdByFeature = new Map<string, number>();
  const featureMaxTokens = new Map<string, number>();
  for (const epic of backlog.epics) {
    for (const feature of epic.features) {
      if (feature.maxTokens !== undefined) featureMaxTokens.set(feature.id, feature.maxTokens);
    }
  }
  const budget = createBudgetTracker(resolveBudgetLimits(
    backlog.version === 2 ? backlog.budget : undefined,
    config.budget,
  ), {
    config,
    saveConfig,
    loadState: loadBudgetState,
    saveState: saveBudgetState,
  }, featureMaxTokens);
  let budgetPauseTriggered = false;
  let autoPilotProtectiveStop = false;

  const repoStageSkills = backlog.version === 2 ? backlog.defaults.stageSkills : {};
  const effectiveStageSkills = collectEffectiveStageSkills(repoStageSkills, config.stageSkills);
  const completedFeatureIds = listCompletedFeatureIds(repoId);

  const resolvedPlan = opts.featureId
    ? ((): Feature[] => {
        const plan = selectStartableFeaturePlan(backlog, opts.featureId, completedFeatureIds);
        if (plan.pendingDependencies.length > 0) {
          throw new Error(
            `Feature ${opts.featureId} has pending dependencies: ${plan.pendingDependencies.join(', ')}. Complete them before starting this feature.`,
          );
        }
        return [{ ...plan.target, dependsOn: [] }];
      })()
    : topoOrder(backlog);
  const initialSnapshot = {
    plan: resolvedPlan.map((feature) => feature.id),
    done: [] as string[],
    pending: resolvedPlan.map((feature) => feature.id),
    active: [] as string[],
    aborted: [] as string[],
    workflowRevisions: captureWorkflowRevisions(resolvedPlan),
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
  const ordered = applyWorkflowRevisions(
    resolvedPlan.filter((feature) => remainingIds.has(feature.id)),
    persistedSnapshot.workflowRevisions,
  );

  const registry = createSkillRegistry();
  const detachPersistence = attachRunPersistence();
  const detachLogger = attachDefaultEventLogger();
  const detachNotifications = attachEventNotifications();
  startTelegramPoller();

  const handleGlobalBudgetViolation = (violation: BudgetViolation, feature: Feature): void => {
    if (budgetPauseTriggered) return;
    budgetPauseTriggered = true;
    autoPilotProtectiveStop = true;
    const gateRunId = createRun(repoId, feature.id, 'budget', { pipelineId });
    const summary = formatBudgetViolation(violation);
    finishRun(gateRunId, 'blocked', summary);
    createGate(gateRunId, feature.id, repoId);
    pausePipeline(pipelineId);
    msqEventBus.emit('run:blocked', {
      runId: gateRunId,
      featureId: feature.id,
      tool: feature.tool,
      reason: 'budget',
      summary,
    });
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
        handleGlobalBudgetViolation(violation, feature);
      } else {
        createGate(runId, feature.id, repoId);
        autoPilotProtectiveStop = true;
        msqEventBus.emit('run:blocked', {
          runId,
          featureId: feature.id,
          tool: feature.tool,
          reason: 'token',
          summary: formatBudgetViolation(violation),
        });
      }
    }
  };

  const executeStageRun = async (
    feature: Feature,
    prompt: string,
    stage?: string,
    abortSignal?: AbortSignal,
    session?: RunFeatureOptions['session'],
  ): Promise<{ runId: number; res: RunResult }> => {
    const runId = createRun(repoId, feature.id, feature.tool, { pipelineId, stage });
    lastRunIdByFeature.set(feature.id, runId);
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
      const initialRes = await runWithRetry(feature, prompt, {
        cwd: opts.cwd,
        runId,
        repoId,
        signal: abortSignal,
        session,
        resumeOverride: opts.resumeOverride?.featureId === feature.id ? opts.resumeOverride : undefined,
      });
      const res = applyImplementPublishGate(initialRes, stage, opts.cwd);
      if (res.usage) {
        recordUsage(runId, res.usage);
        applyBudgetUsage(feature, res.usage, runId);
      }
      if (res.publishEvidence) {
        updateRunPublishState(runId, {
          verified: res.publishVerified ?? false,
          error: res.publishVerified ? null : res.summary,
          evidence: res.publishEvidence,
        });
      }

      if (res.timeout) {
        const occurrence = createTimeoutOccurrence({
          runId,
          pipelineId,
          featureId: feature.id,
          stage,
          timeoutMs: res.timeout.timeoutMs,
          runtimeMs: res.timeout.runtimeMs,
          lastProgress: res.timeout.lastProgress,
        });
        const request = occurrence ? createTimeoutApprovalRequest(occurrence.id) : null;
        finishRun(runId, 'blocked', res.summary);
        setPipelineStatus(pipelineId, 'blocked');
        if (stage) {
          msqEventBus.emit('task:updated', {
            runId, featureId: feature.id, taskId: stage, status: 'blocked', stage,
            endedAt: new Date().toISOString(),
          });
        }
        if (occurrence && request) {
          msqEventBus.emit('timeout:approval-created', {
            requestId: request.id,
            occurrenceId: occurrence.id,
            runId,
            pipelineId,
            featureId: feature.id,
            ...(stage ? { stage } : {}),
            timeoutMs: occurrence.timeoutMs,
            runtimeMs: occurrence.runtimeMs,
            ...(occurrence.lastProgress ? { lastProgress: occurrence.lastProgress } : {}),
          });
        }
        activeRunIds.delete(runId);
        return { runId, res };
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
        msqEventBus.emit('run:blocked', {
          runId,
          featureId: feature.id,
          tool: feature.tool,
          reason: 'needs_input',
          summary: res.summary,
        });
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
          kind: 'aborted',
        });
        activeRunIds.delete(runId);
        return { runId, res };
      }

      const failurePolicy = getOnFailPolicy(feature);
      const failureStatus = res.publishVerificationStatus ?? (failurePolicy === 'gate' ? 'blocked' : 'failed');
      const status = res.ok ? 'done' : failureStatus;
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
      } else if (status === 'blocked') {
        msqEventBus.emit('run:blocked', {
          runId,
          featureId: feature.id,
          tool: feature.tool,
          reason: 'gate',
          summary: res.summary,
        });
      } else {
        msqEventBus.emit('run:failed', {
          runId,
          featureId: feature.id,
          tool: feature.tool,
          error: res.summary,
          kind: 'execution',
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
        kind: 'execution',
      });
      activeRunIds.delete(runId);
      throw err;
    }
  };

  const execute = async (feature: Feature): Promise<RunResult> => {
    const violation = budget.globalViolation();
    if (violation) {
      handleGlobalBudgetViolation(violation, feature);
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

  // F45: after a feature that opted into `autoStart` reaches a qualifying
  // outcome, spawn the next eligible autoStart feature as a new detached
  // process — the same "fire and forget" idiom `src/web/server.ts` already
  // uses to launch feature runs, since a running `msq run --feature` process
  // has no in-process event channel to any other feature's run.
  const dispatchNextAutoStartFeature = (featureId: string): void => {
    const entrypoint = process.argv[1];
    if (!entrypoint) {
      msqEventBus.emit('ui:notice', {
        message: `Auto-pilot could not start ${featureId}: CLI entrypoint was not resolved.`,
      });
      return;
    }
    const child = spawn(
      process.execPath,
      [...process.execArgv, entrypoint, 'run', '--feature', featureId],
      { detached: true, stdio: 'ignore', cwd: opts.cwd },
    );
    child.once('error', (error) => {
      msqEventBus.emit('ui:notice', { message: `Auto-pilot could not start ${featureId}: ${error.message}` });
    });
    child.unref();
    msqEventBus.emit('ui:info', { message: `Auto-pilot starting ${featureId}...` });
  };

  const evaluateAutoPilot = (feature: Feature, result: RunResult): void => {
    // Auto-pilot only spawns a *new* detached process for the next feature —
    // when this run already covers the whole backlog in-process (bare `msq
    // run`, no --feature), the scheduler above already dispatches every
    // remaining feature itself, so spawning here would double-start work.
    if (!opts.featureId) return;
    const liveFeature = getCatalogFeature(repoId, feature.id) ?? feature;
    if (!liveFeature.autoStart) return;

    const triggerRunId = lastRunIdByFeature.get(feature.id) ?? 0;

    let outcomeKind: AutoPilotOutcomeKind;
    if (autoPilotProtectiveStop) {
      outcomeKind = 'blocked-protective';
    } else if (result.aborted) {
      outcomeKind = classifyFailedOutcome('aborted');
    } else if (result.ok) {
      outcomeKind = classifySuccessOutcome();
    } else if (result.control?.type === 'needs_input') {
      outcomeKind = classifyBlockedOutcome('needs_input');
    } else if (getOnFailPolicy(feature) === 'gate') {
      outcomeKind = classifyBlockedOutcome('gate');
    } else {
      outcomeKind = classifyFailedOutcome('execution');
    }

    let selected: Feature | undefined;
    if (shouldEvaluateNextCandidate(outcomeKind)) {
      const doneFeatureIds = listCompletedFeatureIds(repoId);
      const activeRuns = listRunsForTui(500, repoId);
      const activeFeatureIds = new Set(
        activeRuns
          .filter((run) => run.status === 'running' || run.status === 'blocked')
          .map((run) => run.featureId),
      );
      const fullOrder = topoOrder(backlog);
      selected = selectNextAutoStartCandidate(fullOrder, doneFeatureIds, activeFeatureIds, {
        getLiveFeature: (id) => getCatalogFeature(repoId, id),
      });
    }

    const decision = buildAutoPilotDecision({
      triggerFeatureId: feature.id,
      triggerRunId,
      triggerKind: outcomeKind,
      selected,
    });

    msqEventBus.emit('autopilot:decision', decision);

    if (decision.action === 'start' && decision.selectedFeatureId) {
      dispatchNextAutoStartFeature(decision.selectedFeatureId);
    }
  };

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
      if (!current) {
        evaluateAutoPilot(feature, result);
        return;
      }
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
        // Evaluate after the snapshot write commits, so a DB-backed
        // done/active lookup during selection reflects this feature's own
        // just-finished outcome instead of stale pre-completion state.
        evaluateAutoPilot(feature, result);
        return;
      }
      if (result.timeout) {
        updatePipelineSnapshot(pipelineId, {
          active: withoutActive,
          pending: snapshot.pending.filter((item) => item !== feature.id),
          aborted: [...snapshot.aborted.filter((item) => item !== feature.id), feature.id],
        }, {
          status: 'blocked',
          clearAbortRequest: true,
        });
        evaluateAutoPilot(feature, result);
        return;
      }
      const shouldCountAsDone = result.ok || getOnFailPolicy(feature) === 'continue';
      // A genuine failure (stop/gate policy, not aborted) must land in `aborted` —
      // the "needs rerun" bucket — instead of nowhere. Otherwise it vanishes from
      // pending/active/done/aborted entirely and `msq resume`/the TUI have no
      // record that this feature still needs to run (see F39 resume flow).
      const needsRerun = !shouldCountAsDone;
      updatePipelineSnapshot(pipelineId, {
        active: withoutActive,
        done: shouldCountAsDone
          ? [...snapshot.done.filter((item) => item !== feature.id), feature.id]
          : snapshot.done,
        pending: snapshot.pending.filter((item) => item !== feature.id),
        aborted: needsRerun
          ? [...snapshot.aborted.filter((item) => item !== feature.id), feature.id]
          : snapshot.aborted.filter((item) => item !== feature.id),
      }, {
        clearAbortRequest: true,
      });
      evaluateAutoPilot(feature, result);
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
  session?: RunFeatureOptions['session'],
) => Promise<{
  runId: number;
  res: RunResult;
}>;

interface RetryRunOptions {
  cwd: string;
  runId: number;
  repoId: string;
  signal?: AbortSignal;
  session?: RunFeatureOptions['session'];
  resumeOverride?: ResumeOverride;
}

interface RetryCandidate {
  tool: Tool;
  model?: string;
  effort: Effort;
  maxAttempts: number;
}

function buildRetryCandidates(feature: Feature, resumeOverride?: ResumeOverride): RetryCandidate[] {
  const primary: RetryCandidate = {
    tool: resumeOverride?.tool ?? feature.tool,
    model: resumeOverride?.model ?? feature.model,
    effort: resumeOverride?.effort ?? feature.effort,
    maxAttempts: feature.retry?.maxAttempts ?? 1,
  };
  const fallbacks = (feature.retry?.fallback ?? []).map((alt) => ({
    tool: alt.tool,
    model: alt.model ?? feature.model,
    effort: alt.effort ?? feature.effort,
    maxAttempts: alt.maxAttempts,
  }));
  return [primary, ...fallbacks];
}

function resolvePrimaryTool(feature: Feature, resumeOverride?: ResumeOverride): Tool {
  return buildRetryCandidates(feature, resumeOverride)[0]?.tool ?? feature.tool;
}

async function runWithRetry(
  feature: Feature,
  prompt: string,
  opts: RetryRunOptions,
): Promise<RunResult> {
  const backoffMs = feature.retry?.backoffMs ?? 5000;
  const candidates = buildRetryCandidates(feature, opts.resumeOverride);
  let lastResult: RunResult | null = null;
  let lastCandidateTool: Tool | null = null;
  let attempt = 0;

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const adapter = getAdapter(candidate.tool);
    const candidateFeature: Feature = {
      ...feature,
      tool: candidate.tool,
      model: candidate.model,
      effort: candidate.effort,
    };

    for (let localAttempt = 1; localAttempt <= candidate.maxAttempts; localAttempt += 1) {
      attempt += 1;
      const session = opts.session?.mode === 'resume' && opts.session.handle?.tool === candidate.tool
        ? opts.session
        : undefined;
      const res = await adapter.runFeature(candidateFeature, prompt, {
        cwd: opts.cwd,
        runId: opts.runId,
        signal: opts.signal,
        session,
      });

      if (res.ok || res.control?.type === 'needs_input') {
        if (candidate.tool !== feature.tool) updateRunTool(opts.runId, candidate.tool);
        return res;
      }

      if (res.timeout) return res;

      lastResult = res;
      lastCandidateTool = candidate.tool;

      const isLastAttemptOfCandidate = localAttempt === candidate.maxAttempts;
      const isLastCandidate = candidateIndex === candidates.length - 1;
      if (!(isLastAttemptOfCandidate && isLastCandidate)) {
        const waitMs = backoffWithJitter(backoffMs, attempt);
        createRetryRecord(opts.runId, attempt, res.summary, waitMs, candidate.tool, candidate.model);
        await sleep(waitMs);
      }
    }
  }

  if (!lastResult) {
    throw new Error(`Feature ${feature.id} did not produce a run result.`);
  }

  if (lastCandidateTool && lastCandidateTool !== feature.tool) {
    updateRunTool(opts.runId, lastCandidateTool);
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
  config: ReturnType<typeof resolveRuntimeConfig>,
  opts: ExecuteOptions,
  executeStageRun: StageExecutor,
  stageSkills: Record<string, string[]>,
  abortSignal?: AbortSignal,
): Promise<RunResult> {
  const workflow = feature.workflow;
  const sessionPolicy = workflow.sessionPolicy;
  // Re-read `approvals.autoAdvance` from the catalog at each transition
  // rather than caching it once — the web UI lets the user flip this
  // checkbox while a run is already in flight, and that edit must take
  // effect on the very next stage transition instead of only on future runs.
  const resolveAutoAdvance = (): boolean => {
    if (opts.autoAdvanceStages !== undefined) return opts.autoAdvanceStages;
    let featureAutoAdvance = workflow.approvals.autoAdvance;
    try {
      const { repoId } = resolveRepo(opts.cwd);
      const liveFeature = getCatalogFeature(repoId, feature.id);
      if (liveFeature) featureAutoAdvance = liveFeature.workflow.approvals.autoAdvance;
    } catch {
      // catalog read failed (e.g. sandboxed harness DB) — fall back to the
      // value captured when this run started rather than aborting a stage
      // transition over a config re-check.
    }
    return featureAutoAdvance || config.workflow.autoAdvanceStages;
  };
  const stages = workflow.stages;
  const persistedRequests = listStageRequestsForFeature(pipelineId, feature.id);
  const stageInputs = loadPersistedStageInputs(persistedRequests);
  const currentStage = getPipeline(pipelineId)?.currentStage ?? null;
  let pendingTransitionDecisionId: number | null = null;
  let nextStageSession: RunFeatureOptions['session'] | undefined;
  // A gate-blocked stage leaves `currentStage` set and re-enters this
  // function within the same process once the scheduler resumes it — treat
  // that the same as an explicit `msq resume` so it continues from the
  // stage that was in flight instead of restarting from stage 0.
  const startIndex = determineStageStartIndex(
    stages,
    currentStage,
    persistedRequests,
    Boolean(opts.resumePipelineId) || currentStage !== null,
  );

  for (let index = startIndex; index < stages.length; index += 1) {
    const stage = stages[index] ?? 'implement';
    updatePipelineStage(pipelineId, stage);
    const stageSkillList = resolveStageSkill(feature, stage, registry, opts.cwd, stageSkills);
    const stepGuidanceSkills = resolveStepGuidanceSkills(feature, stage, registry, opts.cwd);
    const prompt = buildStagePrompt(
      feature,
      stage,
      stageSkillList,
      stepGuidanceSkills,
      opts.cwd,
      config.promptContextCharLimit,
      stageInputs.get(stage) ?? [],
    );
    const { runId, res } = await executeStageRun(feature, prompt, stage, abortSignal, nextStageSession);
    if (pendingTransitionDecisionId !== null) {
      updateStageTransitionDecisionNextSessionId(
        pendingTransitionDecisionId,
        res.session?.sessionId ?? null,
      );
      pendingTransitionDecisionId = null;
    }
    nextStageSession = undefined;

    if (res.control?.type === 'needs_input') {
      const requestId = createStageRequest(
        pipelineId,
        feature.id,
        stage,
        'input',
        res.control.prompt,
        { runId, options: res.control.options },
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

    const nextStage = stages[index + 1] ?? 'done';
    const transitionPlan = decideStageTransition({
      policy: sessionPolicy,
      telemetry: getRunContextTelemetry(runId),
      nextStage,
      expectedTool: resolvePrimaryTool(
        feature,
        opts.resumeOverride?.featureId === feature.id ? opts.resumeOverride : undefined,
      ),
      previousSession: res.session,
    });
    const transitionDecision = {
      pipelineId,
      featureId: feature.id,
      fromRunId: runId,
      fromStage: stage,
      toStage: nextStage,
      policyMode: transitionPlan.policyMode,
      decision: transitionPlan.decision,
      reason: transitionPlan.reason,
      contextWindowPercent: transitionPlan.contextWindowPercent,
      previousSessionId: transitionPlan.previousSessionId,
      nextSessionId: null,
    } as const;
    pendingTransitionDecisionId = createStageTransitionDecision(transitionDecision);
    msqEventBus.emit('stage:transition-decided', transitionDecision);
    nextStageSession = transitionPlan.session.mode === 'resume' ? transitionPlan.session : undefined;

    if (resolveAutoAdvance()) {
      createStageRequest(
        pipelineId,
        feature.id,
        stage,
        'approval',
        `Auto-advance enabled; next stage: ${nextStage}.`,
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
      `Advance to stage ${nextStage}?`,
      { runId },
    );
    const decision = await waitForStageApproval(
      requestId,
      pipelineId,
      feature.id,
      stage,
      nextStage,
      config.workflow.pollIntervalMs,
      runId,
    );
    if (decision === 'retry') {
      pendingTransitionDecisionId = null;
      nextStageSession = undefined;
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
  stepGuidanceSkills: Skill[],
  cwd: string,
  maxContextChars: number,
  adminInputs: string[],
): string {
  const basePrompt = buildPrompt(feature, skills, cwd, {
    maxContextChars,
    activeStage: stage,
    stepGuidanceSkills,
  });
  const stageNotes = [
    `Current workflow stage: ${stage}.`,
    'Run only this stage in this session.',
    'Do not continue to later stages after finishing the current stage.',
    'If you need admin input, end your final response with exactly: MSQ_INPUT_REQUIRED: <question>',
    'If the question has 1-8 discrete answer options, add a line `OPTIONS:` right after it, followed by one `- <label>` line per option (each label 1-60 characters, no duplicates); otherwise omit it for free-text input.',
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
  if (stage === 'implement') {
    stageNotes.push([
      'Implementation exit contract:',
      `- work on a named branch that is not develop`,
      '- complete the implementation in this session',
      '- run the relevant validation commands before finishing',
      '- create a commit for the implementation',
      '- push the branch to its remote upstream',
      '- open a pull request targeting develop',
      '- do not claim the stage is complete unless all items above were actually completed',
    ].join('\n'));
  }

  const appendedSections = [stageNotes.join('\n'), ...stageContext].filter((section) => section.trim().length > 0);
  return `${basePrompt}\n\n---\n\n${appendedSections.join('\n\n')}`.trim();
}

function applyImplementPublishGate(
  result: RunResult,
  stage: string | undefined,
  cwd: string,
): RunResult {
  if (stage !== 'implement' || !result.ok) return result;

  const verification = verifyPublishContract(cwd);
  return {
    ...result,
    ok: verification.ok,
    summary: verification.ok ? verification.summary : `${result.summary}\n${verification.summary}`.trim(),
    publishEvidence: verification.evidence,
    publishVerified: verification.ok,
    publishVerificationStatus: verification.status === 'done' ? undefined : verification.status,
  };
}

function resolveStepGuidanceSkills(
  feature: Feature,
  stage: string,
  registry: ReturnType<typeof createSkillRegistry>,
  cwd: string,
): Skill[] {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- staged tests still construct partial workflow objects
  const names = feature.workflow.stepGuidance?.[stage]?.skills ?? [];
  if (names.length === 0) return [];
  return registry.resolve([...new Set(names)], cwd);
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
