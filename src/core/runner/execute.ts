import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import type { Backlog, Effort, Feature, OnFail, Tool } from '../backlog/schema.js';
import type { DeclaredPublication, PublishEvidence, RunFeatureOptions, RunResult } from '../adapters/types.js';
import { assertNoCrossRepositoryDependencies, topoOrder, selectStartableFeaturePlan } from '../orchestrator/graph.js';
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
  getLatestRunSessionHandle,
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
  updateRunSessionHandle,
  updateRunTool,
  updateRunExecutionSnapshot,
  updateStageTransitionDecisionNextSessionId,
  type PipelineStatus,
  type PipelineWorkflowRevisions,
  type StageRequestRow,
  type RunExecutionSnapshot,
} from '../../db/repo.js';
import { getCatalogFeature, getFeatureIdOwner } from '../../db/backlogCatalog.js';
import { dispatch } from '../notify/manager.js';
import { startTelegramPoller, stopTelegramPoller } from '../notify/telegram-poller.js';
import { resolveRuntimeConfig } from '../../config/index.js';
import { buildPrompt } from '../backlog/prompt.js';
import { COMMUNICATION_PROTOCOL, PROTOCOL_REINFORCEMENT_PROMPT } from './communicationProtocol.js';
import { createSkillRegistry } from '../skills/index.js';
import { syncFeatureTasksToBacklog } from '../backlog/sync.js';
import type { Skill } from '../skills/types.js';
import { collectEffectiveStageSkills, resolveDefaultStageSkillNames } from '../workflow/stageSkills.js';
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
  logCaughtError,
  msqEventBus,
} from '../events/index.js';
import { loadBudgetState, saveBudgetState } from '../../db/repo.js';
import { saveConfig } from '../../config/index.js';
import { isDescendantOfBase, verifyPublishContract } from '../git/publish.js';
import {
  fetchDependencyBranches,
  resolveDependencyPublications,
  type DependencyPublication,
} from '../git/dependencies.js';
import { stagePublishesResolved } from '../workflow/stagePublishes.js';
import { stackDependencies } from '../backlog/schema.js';
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
    stagePublishes: { ...feature.workflow.stagePublishes },
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
        autoAdvance: feature.workflow.autoAdvance,
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
  // The `--feature` path clears `dependsOn` on the resolved plan (see below), so
  // capture the original dependency edges here to recover dependency PRs later.
  const stackDependenciesByFeature = new Map<string, string[]>();
  for (const epic of backlog.epics) {
    for (const feature of epic.features) {
      if (feature.maxTokens !== undefined) featureMaxTokens.set(feature.id, feature.maxTokens);
      stackDependenciesByFeature.set(feature.id, stackDependencies(feature));
    }
  }
  const dependencyPublicationsFor = (featureId: string): DependencyPublication[] =>
    resolveDependencyPublications(repoId, stackDependenciesByFeature.get(featureId) ?? []);
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
  const effectiveStageSkills = collectEffectiveStageSkills(repoStageSkills);
  const completedFeatureIds = listCompletedFeatureIds(repoId);
  assertNoCrossRepositoryDependencies(backlog, repoId, getFeatureIdOwner);

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
        Boolean(resolvedPlan[resolvedPlan.length - 1]?.workflow.autoAdvance),
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

  // Process-level surface so any unhandled promise rejection or stray throw
  // inside an async subscriber (notification dispatch, persistence write,
  // telemetry) is captured with a labeled `console.error` instead of dying
  // silently — the runner process keeps running otherwise, hiding the failure
  // from anyone tailing the logs. Removed in the `finally` block below.
  const handleUnhandledRejection = (reason: unknown): void => {
    logCaughtError('unhandledRejection', reason);
  };
  const handleUncaughtException = (error: Error): void => {
    logCaughtError('uncaughtException', error);
  };
  process.on('unhandledRejection', handleUnhandledRejection);
  process.on('uncaughtException', handleUncaughtException);

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
    const resumeOverride = opts.resumeOverride?.featureId === feature.id ? opts.resumeOverride : undefined;
    const primaryCandidate = buildRetryCandidates(feature, resumeOverride)[0];
    const runId = createRun(repoId, feature.id, primaryCandidate?.tool ?? feature.tool, {
      pipelineId,
      stage,
      snapshot: buildRunExecutionSnapshot(primaryCandidate ?? {
        tool: feature.tool,
        model: feature.model,
        effort: feature.effort,
        maxAttempts: 1,
      }, feature.thinking, config),
    });
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
        resumeOverride,
        stageSkills: effectiveStageSkills,
        runtimeConfig: config,
      });
      const dependencyPublications = dependencyPublicationsFor(feature.id);
      const publishes = stage !== undefined && stagePublishesResolved(
        stage,
        feature.workflow.mode,
        feature.workflow.stagePublishes,
      );
      const publishGatedRes = applyPublishGate(initialRes, {
        publishes,
        cwd: opts.cwd,
        dependencyBranches: dependencyPublications.map((pub) => pub.branchName),
        baseBranch: config.integration.baseBranch,
      });
      let res = applyBaseReconciliation(
        publishGatedRes,
        opts.cwd,
        dependencyPublications[0]?.branchName ?? config.integration.baseBranch,
      );

      // A run that exits cleanly but never declares MSQ_DONE gets exactly one
      // reinforcement turn in the same adapter session before it is finalized
      // as blocked. Claude in particular tends to pause and ask for
      // confirmation before push/PR even when the stage prompt already
      // authorizes it, which otherwise strands genuinely-completed work as
      // `blocked` (observed on F-4YW66H3T / run 302).
      let reinforcementUsed = false;
      let declaredDone = false;
      for (;;) {
        // Persist the adapter's real session id (when it returned one) so a
        // later resume — new `msq resume` process or an in-process scheduler
        // re-dispatch after a gate/timeout — can continue this exact adapter
        // session instead of always starting fresh.
        if (res.session) updateRunSessionHandle(runId, res.session);
        if (res.usage) {
          recordUsage(runId, res.usage);
          applyBudgetUsage(feature, res.usage, runId);
        }
        if (res.control?.type === 'done' && res.control.publication) {
          updateRunPublishState(runId, {
            // The agent declaration is the source of truth for PR identity.
            // Verification only contributes the independently observed commit
            // and remote details; it must never replace declared PR fields.
            verified: false,
            error: null,
            evidence: declaredPublicationEvidence(res.control.publication),
          });
        }
        if (res.publishEvidence) {
          updateRunPublishState(runId, {
            verified: res.publishVerified ?? false,
            error: res.publishVerified ? (res.publishNote ?? null) : res.summary,
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
          // Intentionally NOT emitting `run:blocked` here: that event routes
          // to the generic "needs human intervention" Telegram handler which
          // strips the question prompt and the discrete options. Routing a
          // needs_input must go through `createStageRequest('input', ...)`,
          // which emits `stage:request-created` and lets the stage:input
          // notification deliver the actual prompt + options buttons. The
          // caller (single-stage loop or staged stage loop) is responsible
          // for creating that stage request so exactly one Telegram message
          // carries the question.
          activeRunIds.delete(runId);
          return { runId, res: { ...res, ok: false } };
        }

        if (res.control?.type === 'blocked') {
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
            reason: 'gate',
            code: res.control.code,
            summary: res.summary,
          });
          activeRunIds.delete(runId);
          return { runId, res: { ...res, ok: false } };
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
            pipelineId,
          });
          activeRunIds.delete(runId);
          return { runId, res };
        }

        declaredDone = res.control?.type === 'done';
        if (res.ok && !declaredDone) {
          if (!reinforcementUsed && res.session) {
            reinforcementUsed = true;
            const reinforced = await attemptProtocolReinforcement(feature, res, {
              cwd: opts.cwd,
              runId,
              signal: abortSignal,
            });
            if (reinforced) {
              const reinforcedGated = applyPublishGate(reinforced, {
                publishes,
                cwd: opts.cwd,
                dependencyBranches: dependencyPublications.map((pub) => pub.branchName),
                baseBranch: config.integration.baseBranch,
              });
              res = applyBaseReconciliation(
                reinforcedGated,
                opts.cwd,
                dependencyPublications[0]?.branchName ?? config.integration.baseBranch,
              );
              continue;
            }
          }
          const summary = reinforcementUsed
            ? 'agent finished without declaring MSQ_DONE (protocol reinforcement attempted)'
            : 'agent finished without declaring MSQ_DONE';
          finishRun(runId, 'blocked', summary);
          if (stage) {
            msqEventBus.emit('task:updated', {
              runId, featureId: feature.id, taskId: stage, status: 'blocked', stage,
              endedAt: new Date().toISOString(),
            });
          }
          msqEventBus.emit('run:blocked', {
            runId,
            featureId: feature.id,
            tool: feature.tool,
            reason: 'gate',
            summary,
          });
          activeRunIds.delete(runId);
          return { runId, res: { ...res, ok: false, summary } };
        }

        break;
      }

      const failurePolicy = getOnFailPolicy(feature);
      const failureStatus = res.publishVerificationStatus ?? (failurePolicy === 'gate' ? 'blocked' : 'failed');
      const status = res.ok && declaredDone ? 'done' : failureStatus;
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
      if (res.ok && declaredDone) {
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
          ...(res.publishValidationFailed ? { code: 'validation_failed' as const } : {}),
          summary: res.summary,
        });
      } else {
        msqEventBus.emit('run:failed', {
          runId,
          featureId: feature.id,
          tool: feature.tool,
          error: res.summary,
          kind: 'execution',
          pipelineId,
          blocked: res.blocked,
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
        pipelineId,
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
    const dependencyPublications = dependencyPublicationsFor(feature.id);
    const publishedDependencyIds = new Set(dependencyPublications.map((publication) => publication.featureId));
    const missingDependencies = (stackDependenciesByFeature.get(feature.id) ?? [])
      .filter((dependencyId) => !publishedDependencyIds.has(dependencyId));
    if (missingDependencies.length > 0) {
      const stage = feature.workflow.mode === 'staged' ? feature.workflow.stages[0] : undefined;
      const runId = createRun(repoId, feature.id, feature.tool, { pipelineId, stage });
      const summary = `dependency_unavailable: ${missingDependencies.join(', ')}`;
      lastRunIdByFeature.set(feature.id, runId);
      finishRun(runId, 'blocked', summary);
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
        reason: 'gate',
        code: 'dependency_unavailable',
        summary,
      });
      return { ok: false, summary };
    }
    const controller = new AbortController();
    activeControllers.set(feature.id, controller);
    const dependencyFetch = fetchDependencyBranches(dependencyPublications, opts.cwd);
    const dependencyFetchFailure = dependencyFetch.failure;
    // A dependency whose PR was merged resolves to its base branch, so the
    // prompt and stacking base must use the ref that still exists.
    const resolvedPublications = dependencyFetch.publications;
    if (dependencyFetchFailure) {
      const runId = createRun(repoId, feature.id, feature.tool, { pipelineId });
      lastRunIdByFeature.set(feature.id, runId);
      const summary = [
        'MSQ_BLOCKED: dependency_unavailable',
        `Could not fetch dependency ${dependencyFetchFailure.featureId} with git fetch ${dependencyFetchFailure.remote} ${dependencyFetchFailure.ref}.`,
        'Verify the dependency branch is published and accessible, then resolve the gate to retry.',
      ].join(' ');
      finishRun(runId, 'blocked', summary);
      createGate(runId, feature.id, repoId);
      setPipelineStatus(pipelineId, 'blocked');
      msqEventBus.emit('run:blocked', {
        runId,
        featureId: feature.id,
        tool: feature.tool,
        reason: 'precondition_failed',
        summary,
      });
      activeControllers.delete(feature.id);
      return { ok: false, blocked: true, summary };
    }
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
          repoStageSkills,
          controller.signal,
          resolvedPublications,
        );
      } finally {
        activeControllers.delete(feature.id);
      }
    }

    const skills = registry.resolve(feature.skills ?? [], opts.cwd);
    const basePrompt = buildPrompt(feature, skills, opts.cwd, {
      maxContextChars: config.promptContextCharLimit,
      dependencyPublications: resolvedPublications,
      baseBranch: config.integration.baseBranch,
    });
    // The single-stage / scheduler path used to ship without the communication
    // protocol in the prompt — only the staged loop appended it via
    // buildStagePrompt. Inline it here so EVERY session is born with the
    // contract, matching the staged behavior and shrinking reliance on the
    // post-hoc reinforcement turn.
    const promptWithProtocol = `${basePrompt}\n\n---\n\n${COMMUNICATION_PROTOCOL}`;
    try {
        const singleStage = feature.workflow.stages[0];
        // Mirror the staged loop: if the agent asks a question
        // (MSQ_INPUT_REQUIRED), route it through `createStageRequest` so the
        // human receives the actual prompt + options buttons in Telegram via
        // stage:input — NOT the generic "needs human intervention" message
        // that the old single-stage path implicitly fell back to. Resume the
        // same adapter session with the human's answer inlined and retry,
        // reusing the same sessionPolicy decision the staged loop uses.
        const stageInputs: string[] = [];
        // Seed the initial session the same way the staged loop does: a
        // retomada (new `msq resume` process or in-process re-dispatch after
        // a gate/timeout) starts this closure fresh, so without this the
        // first adapter call would always begin a brand-new session even
        // when a reusable one was persisted for this exact pipeline+feature+
        // stage. A genuinely new pipeline has no prior run under this
        // `pipelineId`, so the lookup naturally returns nothing there.
        let nextSession: RunFeatureOptions['session'] | undefined;
        if (singleStage) {
          const expectedTool = resolvePrimaryTool(
            feature,
            opts.resumeOverride?.featureId === feature.id ? opts.resumeOverride : undefined,
          );
          const previousHandle = getLatestRunSessionHandle(pipelineId, feature.id, singleStage);
          if (previousHandle?.tool === expectedTool) {
            nextSession = { mode: 'resume', handle: previousHandle };
          }
        }
        // Bounded retry: if the agent keeps asking questions, the human can
        // keep answering; cap the count so a pathological loop cannot run
        // forever against a misbehaving adapter.
        const MAX_INPUT_ROUNDS = 8;
        for (let round = 0; round <= MAX_INPUT_ROUNDS; round += 1) {
          const prompt = stageInputs.length === 0
            ? promptWithProtocol
            : `${promptWithProtocol}\n\n---\n\nAdmin inputs already collected:\n- ${stageInputs.join('\n- ')}`;
          const { runId, res } = await executeStageRun(feature, prompt, singleStage, controller.signal, nextSession);
          if (res.control?.type !== 'needs_input') return res;
          // Stage request routes the question to the operator via stage:input
          // (notifications.ts) with the OPTIONS buttons when present.
          const stageLabel = singleStage ?? 'single';
          const requestId = createStageRequest(
            pipelineId,
            feature.id,
            stageLabel,
            'input',
            res.control.prompt,
            { runId, options: res.control.options },
          );
          const response = await waitForStageRequestResponse(requestId, 2_000);
          stageInputs.push(response);
          const retryPlan = decideStageTransition({
            policy: feature.workflow.sessionPolicy,
            telemetry: getRunContextTelemetry(runId),
            nextStage: stageLabel,
            expectedTool: resolvePrimaryTool(
              feature,
              opts.resumeOverride?.featureId === feature.id ? opts.resumeOverride : undefined,
            ),
            previousSession: res.session,
          });
          nextSession = retryPlan.session.mode === 'resume' ? retryPlan.session : undefined;
        }
        // Exceeded input rounds — give up rather than spin forever.
        return {
          ok: false,
          summary: 'agent kept asking MSQ_INPUT_REQUIRED after the bound of retry rounds',
        };
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
    } else if (result.control?.type === 'blocked') {
      outcomeKind = classifyBlockedOutcome('gate');
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
      void dispatch('run:failed', `metal-squad: execution stopped — ${msg}`).catch((dispatchError: unknown) => {
        // Notification dispatch failures (unconfigured channel, network drop,
        // credential rotation) should never vanish — the original error is
        // rethrown on the next line, but the operator may never see *why* the
        // notification didn't arrive. Log it with a distinct label.
        logCaughtError('runner.notify.run:failed', dispatchError);
      });
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
    process.off('unhandledRejection', handleUnhandledRejection);
    process.off('uncaughtException', handleUncaughtException);
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
  stageSkills?: Record<string, string[]>;
  runtimeConfig: ReturnType<typeof resolveRuntimeConfig>;
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

function buildRunExecutionSnapshot(
  candidate: RetryCandidate,
  thinking: Feature['thinking'],
  config: { tools?: { id: string; command: string }[] },
): RunExecutionSnapshot {
  const tool = config.tools?.find((entry) => entry.id === candidate.tool);
  return {
    ...(candidate.model ? { model: candidate.model } : {}),
    effort: candidate.effort,
    thinking,
    ...(tool?.command ? { toolName: tool.command } : {}),
    metricsConfidence: candidate.model ? 'exact' : 'unknown',
  };
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
        ...(opts.stageSkills && Object.keys(opts.stageSkills).length > 0 ? { stageSkills: opts.stageSkills } : {}),
      });

      if (res.ok || res.control?.type === 'needs_input' || res.control?.type === 'blocked') {
        if (candidate.tool !== feature.tool) updateRunTool(opts.runId, candidate.tool);
        updateRunExecutionSnapshot(opts.runId, buildRunExecutionSnapshot(candidate, feature.thinking, opts.runtimeConfig));
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
  const lastCandidate = candidates[candidates.length - 1];
  if (lastCandidate) updateRunExecutionSnapshot(opts.runId, buildRunExecutionSnapshot(lastCandidate, feature.thinking, opts.runtimeConfig));

  if (getOnFailPolicy(feature) === 'gate') {
    createGate(opts.runId, feature.id, opts.repoId);
  }

  return lastResult;
}

// Sends exactly one follow-up turn in the same resumed adapter session,
// reasserting the communication protocol, when a run exited ok but never
// declared a control signal. Returns null (never throws) when there is no
// resumable session or the adapter call itself fails, so the caller falls
// back to the existing "blocked" classification unchanged.
async function attemptProtocolReinforcement(
  feature: Feature,
  res: RunResult,
  opts: { cwd: string; runId: number; signal?: AbortSignal },
): Promise<RunResult | null> {
  if (!res.session) return null;
  const adapter = getAdapter(res.session.tool);
  const reinforcedFeature: Feature = { ...feature, tool: res.session.tool };
  try {
    return await adapter.runFeature(reinforcedFeature, PROTOCOL_REINFORCEMENT_PROMPT, {
      cwd: opts.cwd,
      runId: opts.runId,
      signal: opts.signal,
      session: { mode: 'resume', handle: res.session },
    });
  } catch (error) {
    logCaughtError('execute.attemptProtocolReinforcement', error);
    return null;
  }
}

async function executeStagedFeature(
  feature: Feature,
  pipelineId: number,
  registry: ReturnType<typeof createSkillRegistry>,
  config: ReturnType<typeof resolveRuntimeConfig>,
  opts: ExecuteOptions,
  executeStageRun: StageExecutor,
  stageSkills: Record<string, string[]>,
  repoStageSkills: Record<string, string[]>,
  abortSignal?: AbortSignal,
  dependencyPublications: DependencyPublication[] = [],
): Promise<RunResult> {
  const workflow = feature.workflow;
  const sessionPolicy = workflow.sessionPolicy;
  // Re-read `workflow.autoAdvance` from the catalog at each transition
  // rather than caching it once — the web UI lets the user flip this
  // checkbox while a run is already in flight, and that edit must take
  // effect on the very next stage transition instead of only on future runs.
  const resolveAutoAdvance = (): boolean => {
    let autoAdvance = workflow.autoAdvance;
    try {
      const { repoId } = resolveRepo(opts.cwd);
      const liveFeature = getCatalogFeature(repoId, feature.id);
      if (liveFeature) autoAdvance = liveFeature.workflow.autoAdvance;
    } catch (error) {
      // catalog read failed (e.g. sandboxed harness DB) — fall back to the
      // value captured when this run started rather than aborting a stage
      // transition over a config re-check.
      logCaughtError('execute.resolveAutoAdvance', error);
    }
    return autoAdvance;
  };
  const stages = workflow.stages;
  const persistedRequests = listStageRequestsForFeature(pipelineId, feature.id);
  const stageInputs = loadPersistedStageInputs(persistedRequests);
  const currentStage = getPipeline(pipelineId)?.currentStage ?? null;
  let pendingTransitionDecisionId: number | null = null;
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

  // Re-attempting the stage this run will actually start on (whether that's
  // an explicit `msq resume` in a new process or an in-process re-dispatch)
  // begins with a fresh local variable here — nothing else seeds it from
  // what got persisted before the previous attempt exited. Without this, the
  // first adapter call of the new attempt always starts a brand-new session
  // even when a reusable one already exists for this exact pipeline+feature+
  // stage. A genuinely new pipeline never has a prior run under this
  // `pipelineId`, so the lookup naturally returns nothing there.
  let nextStageSession: RunFeatureOptions['session'] | undefined;
  const seedStage = stages[startIndex];
  if (seedStage) {
    const expectedTool = resolvePrimaryTool(
      feature,
      opts.resumeOverride?.featureId === feature.id ? opts.resumeOverride : undefined,
    );
    const previousHandle = getLatestRunSessionHandle(pipelineId, feature.id, seedStage);
    if (previousHandle?.tool === expectedTool) {
      nextStageSession = { mode: 'resume', handle: previousHandle };
    }
  }

  for (let index = startIndex; index < stages.length; index += 1) {
    const stage = stages[index] ?? 'implement';
    updatePipelineStage(pipelineId, stage);
    const stageSkillList = resolveStageSkill(feature, stage, registry, opts.cwd, stageSkills, repoStageSkills);
    const stepGuidanceSkills = resolveStepGuidanceSkills(feature, stage, registry, opts.cwd);
    const prompt = buildStagePrompt(
      feature,
      stage,
      stageSkillList,
      stepGuidanceSkills,
      opts.cwd,
      config.promptContextCharLimit,
      stageInputs.get(stage) ?? [],
      dependencyPublications,
      config.integration.baseBranch,
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
      const response = await waitForStageRequestResponse(requestId, 2_000);
      stageInputs.set(stage, [...(stageInputs.get(stage) ?? []), response]);
      // Reuse the same resume-vs-new-session policy as a normal stage
      // transition instead of always forcing a fresh session — a needs_input
      // retry is answering the same stage, not moving to a new one, so
      // discarding `res.session` here would burn tokens re-deriving context
      // the adapter already paid for just to receive the human's answer.
      const retryPlan = decideStageTransition({
        policy: sessionPolicy,
        telemetry: getRunContextTelemetry(runId),
        nextStage: stage,
        expectedTool: resolvePrimaryTool(
          feature,
          opts.resumeOverride?.featureId === feature.id ? opts.resumeOverride : undefined,
        ),
        previousSession: res.session,
      });
      nextStageSession = retryPlan.session.mode === 'resume' ? retryPlan.session : undefined;
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
      } catch (error) {
        // tasks file not yet generated — skip silently
        logCaughtError('execute.syncFeatureTasksToBacklog', error);
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
          approvalChannel: workflow.approvals.channel,
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
      { runId, approvalChannel: workflow.approvals.channel },
    );
    const decision = await waitForStageApproval(
      requestId,
      pipelineId,
      feature.id,
      stage,
      nextStage,
      2_000,
      runId,
      workflow.approvals.channel,
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
  repoStageSkills: Record<string, string[]> = {},
): Skill[] {
  const mappedNames = Object.hasOwn(repoStageSkills, stage)
    ? stageSkills[stage]
    : resolveDefaultStageSkillNames(stage, registry, cwd);
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
  dependencyPublications: DependencyPublication[] = [],
  baseBranch = 'develop',
): string {
  const basePrompt = buildPrompt(feature, skills, cwd, {
    maxContextChars,
    activeStage: stage,
    stepGuidanceSkills,
    dependencyPublications,
    baseBranch,
  });
  const stageNotes = [
    `Current workflow stage: ${stage}.`,
    'Run only this stage in this session.',
    'Do not continue to later stages after finishing the current stage.',
    COMMUNICATION_PROTOCOL,
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
  if (stage === 'implement') {
    stageNotes.push([
      'Implementation exit contract:',
      '- work on a named branch',
      '- complete the implementation in this session',
      '- run the relevant validation commands before finishing',
      '- create a commit for the implementation',
      '- push the branch to its remote upstream',
      `- open a pull request targeting ${baseBranch}, unless # dependency base specifies pr_base for a stacked PR`,
      '- pushing this branch and opening this pull request are pre-authorized for this session; do not pause to ask for confirmation before doing them',
      '- do not claim the stage is complete unless all items above were actually completed',
      '- ending your final response with a plain-language question instead of MSQ_DONE, MSQ_INPUT_REQUIRED, or MSQ_BLOCKED is a protocol violation, even if the question itself is reasonable',
    ].join('\n'));
  }

  const adminInputSection = adminInputs.length > 0
    ? `Admin inputs already collected for this stage:\n- ${adminInputs.join('\n- ')}`
    : null;
  const appendedSections = [stageNotes.join('\n'), ...stageContext, adminInputSection]
    .filter((section): section is string => Boolean(section?.trim()));
  return `${basePrompt}\n\n---\n\n${appendedSections.join('\n\n')}`.trim();
}

function declaredPublicationEvidence(publication: DeclaredPublication): PublishEvidence {
  return {
    branch: publication.head,
    baseBranch: publication.base,
    commitSha: null,
    remoteBranch: null,
    prNumber: publication.prNumber,
    prUrl: publication.prUrl,
  };
}

export function applyPublishGate(
  result: RunResult,
  opts: {
    publishes: boolean;
    cwd: string;
    dependencyBranches: string[];
    baseBranch: string;
  },
  verify: typeof verifyPublishContract = verifyPublishContract,
): RunResult {
  if (!opts.publishes || !result.ok || result.control?.type !== 'done') return result;

  if (!result.control.publication) {
    return {
      ...result,
      ok: false,
      summary: `${result.summary}\nMSQ_DONE is missing required pr_url, pr_number, base, and head publication fields.`.trim(),
      publishVerificationStatus: 'blocked',
      publishValidationFailed: true,
    };
  }

  // A dependent feature may stack its PR on top of any dependency branch, so
  // accept those as valid PR bases alongside the configured integration base.
  const allowedBases = [...opts.dependencyBranches, opts.baseBranch];
  const verification = verify(opts.cwd, allowedBases);
  const declared = declaredPublicationEvidence(result.control.publication);
  const observed = verification.evidence;
  // baseBranch is deliberately excluded from this comparison: verify() already
  // confirms observed.baseBranch is one of allowedBases (H29), so an agent
  // declaring a different-but-still-allowed base (e.g. the backlog dependency
  // branch instead of the base gh actually used) is not a fabricated
  // publication and must not fail a genuinely verified PR.
  const matchesDeclaration = observed.branch === declared.branch
    && observed.prNumber === declared.prNumber
    && observed.prUrl === declared.prUrl;
  const evidence = {
    ...declared,
    baseBranch: observed.baseBranch,
    commitSha: observed.commitSha,
    remoteBranch: observed.remoteBranch,
  };
  const diverged = !matchesDeclaration && (
    (observed.branch !== null && observed.branch !== declared.branch)
    || (observed.prNumber !== null && observed.prNumber !== declared.prNumber)
    || (observed.prUrl !== null && observed.prUrl !== declared.prUrl)
  );
  const summary = diverged
    ? `${result.summary}\nimplement: declared publication does not match verified publication.`.trim()
    : verification.ok ? verification.summary : `${result.summary}\n${verification.summary}`.trim();
  return {
    ...result,
    ok: verification.ok && matchesDeclaration,
    summary,
    publishEvidence: evidence,
    publishVerified: verification.ok && matchesDeclaration,
    publishVerificationStatus: verification.ok && matchesDeclaration
      ? undefined
      : (diverged ? 'blocked' : verification.status === 'done' ? 'failed' : verification.status),
    publishValidationFailed: diverged,
  };
}

// This runs after `applyPublishGate` has already verified a real, open PR
// against whatever base it declares — that GitHub-side check is authoritative
// on the publication itself. `git merge-base --is-ancestor` here is a local,
// redundant sanity check on top of it, and it can be inconclusive for
// legitimate reasons (e.g. the declared dependency branch was already merged
// and its ref deleted). A verified PR must not be blocked by this secondary
// check failing or being inconclusive; surface it as an informational note.
function applyBaseReconciliation(
  result: RunResult,
  cwd: string,
  baseBranch: string | undefined,
): RunResult {
  if (!result.ok || !baseBranch) return result;

  const descendant = isDescendantOfBase(cwd, baseBranch);
  if (descendant === true) return result;

  const detail = descendant === false
    ? `HEAD does not descend from the declared base ${baseBranch}.`
    : `could not verify whether HEAD descends from the declared base ${baseBranch}.`;
  const note = `note: post-run ${detail} A verified GitHub PR already confirms this publication; treat this only as informational.`;
  return {
    ...result,
    summary: [result.summary, note].join('\n'),
    publishNote: note,
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
  _maxContextChars: number,
): string | null {
  const parts = [`Feature: ${feature.title}`];

  if (feature.spec?.trim()) {
    parts.push(`Summary:\n${feature.spec.trim()}`);
  }

  if (feature.specFile && existsSync(resolve(cwd, feature.specFile))) {
    const specFileContent = readFileSync(resolve(cwd, feature.specFile), 'utf8');
    if (specFileContent) {
      parts.push(`Existing feature brief from ${feature.specFile}:\n${specFileContent}`);
    }
  }

  return parts.join('\n\n').trim() || null;
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
  approvalChannel: string,
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
      { runId, approvalChannel },
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
