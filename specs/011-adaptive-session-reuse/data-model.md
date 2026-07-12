# Data Model: Adaptive Session Reuse Between Steps

**Feature**: 011-adaptive-session-reuse  
**Date**: 2026-07-11

## Overview

This feature introduces a per-feature session policy, a reusable adapter session handle, and a persisted audit record for each stage transition that has a next stage.

## Entities

### 1. FeatureSessionPolicy

Represents the resolved per-feature rules for stage-session behavior.

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `mode` | `'isolated' \| 'adaptive'` | Yes | `isolated` preserves F27 behavior |
| `alwaysIsolatedStages` | `string[]` | Yes | Unique list of stage ids that always force a new session |

**Validation rules**:
- `mode` defaults to `isolated`
- `alwaysIsolatedStages` defaults to `[]`
- Every entry in `alwaysIsolatedStages` must also exist in `workflow.stages`
- Duplicate stage ids are rejected or normalized away during schema parsing

**Operational meaning**:
- `isolated`: every next stage starts in a fresh session
- `adaptive`: threshold logic may reuse the previous session unless an override forces isolation

### 2. SessionContinuationHandle

Represents the adapter-owned identifier needed to continue an existing agent session.

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `tool` | `Tool` | Yes | `codex`, `claude`, or `opencode` |
| `sessionId` | `string` | Yes | Provider-specific session/thread identifier |
| `capturedFromRunId` | `number` | Yes | Run that produced the handle |
| `capturedAt` | `string` | Yes | ISO timestamp |

**Validation rules**:
- `sessionId` must be a non-empty string
- A handle may only be resumed by the same `tool`
- If the adapter cannot return a valid handle, the next stage must fall back to a fresh session

### 3. SessionContextTelemetrySnapshot

Represents the authoritative context telemetry used to evaluate the next transition.

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `runId` | `number` | Yes | Completed stage run |
| `stage` | `string` | Yes | Stage name from the run |
| `totalTokens` | `number \| null` | Yes | Persisted on `runs` already |
| `contextWindowTokens` | `number \| null` | Yes | Persisted on `runs` already |
| `contextWindowPercent` | `number \| null` | Yes | F30-derived threshold input |
| `reliable` | `boolean` | Yes | Derived: true when the percent is present and trusted |

**Validation rules**:
- `contextWindowPercent` should be treated as reliable only when present and non-negative
- Missing or invalid telemetry forces `reliable = false`

### 4. StageTransitionDecision

Represents the persisted outcome of evaluating a completed stage against the next stage.

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `pipelineId` | `number` | Yes | Pipeline containing the transition |
| `featureId` | `string` | Yes | Feature being executed |
| `fromRunId` | `number` | Yes | Completed run whose telemetry was evaluated |
| `fromStage` | `string` | Yes | Completed stage |
| `toStage` | `string` | Yes | Next stage to execute |
| `policyMode` | `'isolated' \| 'adaptive'` | Yes | Resolved policy mode at decision time |
| `decision` | `'reuse' \| 'new_session'` | Yes | Actual chosen behavior |
| `reason` | `TransitionDecisionReason` | Yes | Audit reason |
| `contextWindowPercent` | `number \| null` | Yes | Snapshot used for the decision |
| `previousSessionId` | `string \| null` | No | Session produced by `fromRunId`, when known |
| `nextSessionId` | `string \| null` | No | Session actually used by the next stage, when known |
| `createdAt` | `string` | Yes | ISO timestamp |

### 5. TransitionDecisionReason

Allowed reasons for `StageTransitionDecision.reason`.

| Value | Meaning |
|------|---------|
| `adaptive_disabled` | Policy mode is `isolated` |
| `always_isolated_stage` | Next stage was explicitly excluded from reuse |
| `low_usage_reuse` | `contextWindowPercent <= 50` and reuse is allowed |
| `mid_usage_conservative` | `50 < contextWindowPercent < 70` |
| `high_usage_guardrail` | `contextWindowPercent >= 70` |
| `missing_context_telemetry` | The persisted telemetry was absent or unreliable |
| `session_resume_unavailable` | Policy wanted reuse, but no usable continuation handle existed |

## Relationships

- A `Feature` has one resolved `FeatureSessionPolicy`
- A successful staged `Run` may yield one `SessionContinuationHandle`
- A successful staged `Run` with a following stage yields exactly one `StageTransitionDecision`
- A `StageTransitionDecision` references one `SessionContextTelemetrySnapshot`

## State Transitions

### FeatureSessionPolicy

```text
isolated
  -> isolated             (default / unchanged)
  -> adaptive             (feature enables adaptive reuse)

adaptive
  -> adaptive             (stage exceptions or thresholds vary per transition)
  -> isolated             (feature disables adaptive reuse again)
```

### StageTransitionDecision

```text
evaluate transition
  -> new_session / adaptive_disabled
  -> new_session / always_isolated_stage
  -> new_session / missing_context_telemetry
  -> reuse       / low_usage_reuse
  -> new_session / mid_usage_conservative
  -> new_session / high_usage_guardrail
  -> new_session / session_resume_unavailable
```

## Notes for Implementation

- `SessionContextTelemetrySnapshot` does not require a new storage table if `runs` remains the authoritative source
- `StageTransitionDecision` should be persisted separately from `stage_requests`
- `nextSessionId` may be filled after the next run is created if the adapter returns a new handle only on run completion
