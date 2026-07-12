import type { SessionHandle, SessionReuseMode } from '../adapters/types.js';
import type { Tool, WorkflowSessionPolicy } from '../backlog/schema.js';

export type TransitionDecisionReason =
  | 'adaptive_disabled'
  | 'always_isolated_stage'
  | 'low_usage_reuse'
  | 'mid_usage_conservative'
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

export function decideStageTransition(input: DecideStageTransitionInput): StageTransitionPlan {
  const { policy, telemetry, nextStage, expectedTool, previousSession } = input;
  const previousSessionId = previousSession?.sessionId ?? null;

  if (policy.mode === 'isolated') {
    return {
      decision: 'new_session',
      reason: 'adaptive_disabled',
      policyMode: policy.mode,
      contextWindowPercent: telemetry.contextWindowPercent,
      session: { mode: 'new' },
      previousSessionId,
    };
  }

  if (policy.alwaysIsolatedStages.includes(nextStage)) {
    return {
      decision: 'new_session',
      reason: 'always_isolated_stage',
      policyMode: policy.mode,
      contextWindowPercent: telemetry.contextWindowPercent,
      session: { mode: 'new' },
      previousSessionId,
    };
  }

  if (!telemetry.reliable) {
    return {
      decision: 'new_session',
      reason: 'missing_context_telemetry',
      policyMode: policy.mode,
      contextWindowPercent: telemetry.contextWindowPercent,
      session: { mode: 'new' },
      previousSessionId,
    };
  }

  const percent = telemetry.contextWindowPercent ?? null;
  if (percent !== null && percent <= 50) {
    if (isReusableHandle(previousSession, expectedTool)) {
      return {
        decision: 'reuse',
        reason: 'low_usage_reuse',
        policyMode: policy.mode,
        contextWindowPercent: percent,
        session: { mode: 'resume', handle: previousSession },
        previousSessionId,
      };
    }

    return {
      decision: 'new_session',
      reason: 'session_resume_unavailable',
      policyMode: policy.mode,
      contextWindowPercent: percent,
      session: { mode: 'new' },
      previousSessionId,
    };
  }

  if (percent !== null && percent >= 70) {
    return {
      decision: 'new_session',
      reason: 'high_usage_guardrail',
      policyMode: policy.mode,
      contextWindowPercent: percent,
      session: { mode: 'new' },
      previousSessionId,
    };
  }

  return {
    decision: 'new_session',
    reason: 'mid_usage_conservative',
    policyMode: policy.mode,
    contextWindowPercent: percent,
    session: { mode: 'new' },
    previousSessionId,
  };
}
