import type { SessionHandle, SessionReuseMode } from '../adapters/types.js';
import type { Tool, WorkflowSessionPolicy } from '../backlog/schema.js';

export type TransitionDecisionReason =
  | 'adaptive_disabled'
  | 'always_isolated_stage'
  | 'low_usage_reuse'
  | 'mid_usage_reuse'
  | 'sixty_percent_guardrail'
  | 'high_usage_guardrail'
  | 'missing_context_telemetry'
  | 'session_resume_unavailable';

export interface SessionContextTelemetrySnapshot {
  runId: number;
  stage: string | null;
  contextWindowPercent: number | null;
  reliable: boolean;
}

export interface StageTransitionDecision {
  pipelineId: number;
  featureId: string;
  fromRunId: number;
  fromStage: string;
  toStage: string;
  policyMode: WorkflowSessionPolicy['mode'];
  decision: 'reuse' | 'new_session';
  reason: TransitionDecisionReason;
  contextWindowPercent: number | null;
  previousSessionId: string | null;
  nextSessionId: string | null;
}

export interface StageTransitionPlan {
  decision: StageTransitionDecision['decision'];
  reason: TransitionDecisionReason;
  policyMode: WorkflowSessionPolicy['mode'];
  contextWindowPercent: number | null;
  session: {
    mode: SessionReuseMode;
    handle?: SessionHandle;
  };
  previousSessionId: string | null;
}

interface DecideStageTransitionInput {
  policy: WorkflowSessionPolicy;
  telemetry: SessionContextTelemetrySnapshot;
  nextStage: string;
  expectedTool: Tool;
  previousSession?: SessionHandle | null;
}

function isReusableHandle(handle: SessionHandle | null | undefined, expectedTool: Tool): handle is SessionHandle {
  return handle?.tool === expectedTool && handle.sessionId.trim().length > 0;
}

function buildNewSessionPlan(
  reason: TransitionDecisionReason,
  policyMode: WorkflowSessionPolicy['mode'],
  contextWindowPercent: number | null,
  previousSessionId: string | null,
): StageTransitionPlan {
  return {
    decision: 'new_session',
    reason,
    policyMode,
    contextWindowPercent,
    session: { mode: 'new' },
    previousSessionId,
  };
}

function buildReusePlan(
  reason: Extract<TransitionDecisionReason, 'low_usage_reuse' | 'mid_usage_reuse'>,
  policyMode: WorkflowSessionPolicy['mode'],
  contextWindowPercent: number,
  previousSession: SessionHandle | null | undefined,
  previousSessionId: string | null,
  expectedTool: Tool,
): StageTransitionPlan {
  if (isReusableHandle(previousSession, expectedTool)) {
    return {
      decision: 'reuse',
      reason,
      policyMode,
      contextWindowPercent,
      session: { mode: 'resume', handle: previousSession },
      previousSessionId,
    };
  }

  return buildNewSessionPlan(
    'session_resume_unavailable',
    policyMode,
    contextWindowPercent,
    previousSessionId,
  );
}

export function decideStageTransition(input: DecideStageTransitionInput): StageTransitionPlan {
  const { policy, telemetry, nextStage, expectedTool, previousSession } = input;
  const previousSessionId = previousSession?.sessionId ?? null;

  if (policy.mode === 'isolated') {
    return buildNewSessionPlan(
      'adaptive_disabled',
      policy.mode,
      telemetry.contextWindowPercent,
      previousSessionId,
    );
  }

  if (policy.alwaysIsolatedStages.includes(nextStage)) {
    return buildNewSessionPlan(
      'always_isolated_stage',
      policy.mode,
      telemetry.contextWindowPercent,
      previousSessionId,
    );
  }

  if (!telemetry.reliable) {
    return buildNewSessionPlan(
      'missing_context_telemetry',
      policy.mode,
      telemetry.contextWindowPercent,
      previousSessionId,
    );
  }

  const percent = telemetry.contextWindowPercent ?? null;
  if (percent === null) {
    return buildNewSessionPlan(
      'missing_context_telemetry',
      policy.mode,
      null,
      previousSessionId,
    );
  }

  if (percent <= 50) {
    return buildReusePlan(
      'low_usage_reuse',
      policy.mode,
      percent,
      previousSession,
      previousSessionId,
      expectedTool,
    );
  }

  if (percent < 60) {
    return buildReusePlan(
      'mid_usage_reuse',
      policy.mode,
      percent,
      previousSession,
      previousSessionId,
      expectedTool,
    );
  }

  if (percent < 70) {
    return buildNewSessionPlan(
      'sixty_percent_guardrail',
      policy.mode,
      percent,
      previousSessionId,
    );
  }

  return buildNewSessionPlan(
    'high_usage_guardrail',
    policy.mode,
    percent,
    previousSessionId,
  );
}
