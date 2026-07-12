# Contract: Stage Transition Decision Audit

## Purpose

Define the internal contract between the runner, persistence layer, and read surfaces for recording why a staged workflow reused or replaced a session.

## Scope

- `src/core/runner/execute.ts`
- `src/core/workflow/sessionPolicy.ts` (new helper)
- `src/core/adapters/types.ts`
- `src/db/repo.ts`
- `src/core/events/types.ts`
- read surfaces such as status/TUI/web that need to inspect the result later

## Type Contract

```ts
type TransitionDecisionReason =
  | 'adaptive_disabled'
  | 'always_isolated_stage'
  | 'low_usage_reuse'
  | 'mid_usage_reuse'
  | 'sixty_percent_guardrail'
  | 'high_usage_guardrail'
  | 'missing_context_telemetry'
  | 'session_resume_unavailable';

interface StageTransitionDecision {
  pipelineId: number;
  featureId: string;
  fromRunId: number;
  fromStage: string;
  toStage: string;
  policyMode: 'isolated' | 'adaptive';
  decision: 'reuse' | 'new_session';
  reason: TransitionDecisionReason;
  contextWindowPercent: number | null;
  previousSessionId: string | null;
  nextSessionId: string | null;
  createdAt: string;
}
```

## Write Contract

The runner MUST create exactly one transition decision when all of the following are true:

1. the current stage finished successfully
2. the workflow has a next stage
3. the runner evaluated the next-stage session policy

The decision MUST be written before the next stage starts so that:

- a crash between stages still leaves the chosen reason auditable
- manual inspection can explain why the next stage is waiting to resume or start fresh

## Decision Rules

Ordered precedence:

1. `adaptive_disabled` when policy mode is `isolated`
2. `always_isolated_stage` when `toStage` is in `alwaysIsolatedStages`
3. `missing_context_telemetry` when `runs.context_window_percent` is absent or unusable
4. `low_usage_reuse` when `contextWindowPercent <= 50`
5. `mid_usage_reuse` when `50 < contextWindowPercent < 60`
6. `sixty_percent_guardrail` when `60 <= contextWindowPercent < 70`
7. `high_usage_guardrail` when `contextWindowPercent >= 70`
8. `session_resume_unavailable` when the chosen path was reuse but no valid session handle was available

## Persistence Expectations

Recommended storage columns:

| Column | Type | Notes |
|--------|------|-------|
| `pipeline_id` | integer | pipeline foreign key |
| `feature_id` | text | feature id |
| `from_run_id` | integer | completed stage run |
| `from_stage` | text | completed stage |
| `to_stage` | text | next stage |
| `policy_mode` | text | `isolated` or `adaptive` |
| `decision` | text | `reuse` or `new_session` |
| `reason` | text | enum value above |
| `context_window_percent` | real nullable | F30 telemetry snapshot |
| `previous_session_id` | text nullable | source handle |
| `next_session_id` | text nullable | actual target handle |
| `created_at` | text | timestamp |

## Event Contract

If the event bus is extended, the emitted payload should mirror the persisted record:

```ts
interface StageTransitionDecidedEvent extends StageTransitionDecision {}
```

Recommended event name: `stage:transition-decided`.

## Read Contract

Consumers should be able to answer:

- Why did the next stage start in a fresh session?
- Which transitions actually reused a session?
- What context percentage backed the decision?
- Was the decision caused by policy, telemetry, or adapter capability?
