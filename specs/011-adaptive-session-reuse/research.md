# Research: Adaptive Session Reuse Between Steps

**Feature**: 011-adaptive-session-reuse  
**Date**: 2026-07-11  
**Status**: Complete

## Overview

This document records the design decisions needed to add adaptive stage-session reuse without regressing the staged isolation delivered by F27.

## Research Task 1: Where should the per-feature policy live?

**Question**: How should the backlog express "adaptive reuse on/off" plus "always isolated stages" without scattering workflow settings across the feature schema?

### Decision: add `workflow.sessionPolicy` on each feature

Proposed shape:

```yaml
workflow:
  mode: staged
  stages: [specify, plan, tasks, implement, validate]
  approvals:
    channel: telegram
    autoAdvance: false
  syncTasksToBacklog: true
  sessionPolicy:
    mode: adaptive        # or isolated
    alwaysIsolatedStages:
      - specify
      - plan
```

**Rationale**:
- Session reuse is a stage-transition concern, so it belongs beside `mode`, `stages`, `approvals`, and `syncTasksToBacklog`
- An explicit `mode: isolated | adaptive` is clearer than a bare boolean and preserves room for future policies
- `alwaysIsolatedStages` can be validated against `workflow.stages` in the same schema branch
- The same resolved structure can be surfaced in `src/ui/catalog.ts` and `FeatureConfigSection.tsx`

**Alternatives considered**:
- Top-level `feature.sessionPolicy`: rejected because it splits workflow configuration across unrelated branches
- A single boolean `adaptiveSessionReuse`: rejected because it does not scale well once stage exceptions are added
- Global-only defaults: rejected because the spec requires explicit per-feature control

## Research Task 2: Where should the transition decision run?

**Question**: Which layer should decide whether the next stage reuses or replaces the previous session?

### Decision: centralize the decision in a dedicated workflow helper called by `executeStagedFeature()`

**Rationale**:
- `src/core/runner/execute.ts` already owns stage sequencing, approvals, retries, and task sync
- The architecture rules explicitly keep business rules out of CLI/UI layers and out of adapters
- Extracting the decision into `src/core/workflow/sessionPolicy.ts` keeps `execute.ts` readable while preserving runner ownership
- The helper can consume:
  - resolved `workflow.sessionPolicy`
  - `currentStage` and `nextStage`
  - the completed run's persisted telemetry (`runs.context_window_percent`)
  - the previous session handle, if one exists

**Decision order**:
1. If policy mode is `isolated`, force new session
2. If `nextStage` is in `alwaysIsolatedStages`, force new session
3. If context telemetry is missing or unreliable, force new session
4. If usage is `<= 50%`, allow reuse
5. If usage is `> 50%` and `< 70%`, force new session
6. If usage is `>= 70%`, force new session

**Alternatives considered**:
- Let each adapter decide: rejected because thresholds and stage exceptions are product policy, not transport concerns
- Encode the decision inline in `execute.ts` only: workable, but harder to test in isolation and easier to bloat further

## Research Task 3: How should adapters participate in session reuse?

**Question**: The current `ToolAdapter` API is stateless. How do we reuse sessions without leaking CLI-specific flags into the runner?

### Decision: extend the adapter contract around a provider-agnostic session handle

Proposed interface evolution:

```ts
interface SessionHandle {
  tool: Tool;
  sessionId: string;
}

interface RunFeatureOptions {
  cwd: string;
  runId: number;
  signal?: AbortSignal;
  session?: {
    mode: 'new' | 'resume';
    handle?: SessionHandle;
  };
}

interface RunResult {
  ok: boolean;
  summary: string;
  usage?: TokenUsage;
  control?: RunControl;
  aborted?: boolean;
  session?: SessionHandle | null;
}
```

**Rationale**:
- The runner only needs to ask for `new` vs `resume`; each adapter maps that to its native CLI
- Local CLI help confirms the capability exists in the installed tools:
  - `codex exec resume [SESSION_ID] [PROMPT]`
  - `claude --resume <id>` / `--continue`
  - `opencode run --session <id>` / `--continue`
- The same contract also supports the safe fallback path: if a session handle is absent or unusable, the runner records a forced-new-session audit reason

**Alternatives considered**:
- Runner shells out to provider-specific resume commands directly: rejected because it violates adapter ownership
- Reconstruct context by replaying stage outputs into a new session: rejected because it duplicates context, increases token cost, and is not true reuse

## Research Task 4: How should auditability be persisted?

**Question**: FR-008 requires each transition to be inspectable later. Where should that record live?

### Decision: add a dedicated stage-transition audit record

**Rationale**:
- `stage_requests` records approvals and admin inputs, not transition policy outcomes
- Run summaries and stdout logs are not structured enough for reliable filtering or UI display
- A dedicated table and event preserve a clean query surface for TUI/web/status tooling

Proposed persisted fields:
- `pipelineId`
- `featureId`
- `fromRunId`
- `fromStage`
- `toStage`
- `policyMode`
- `contextWindowPercent` (nullable)
- `decision` (`reuse` or `new_session`)
- `reason`
- `previousSessionId` (nullable)
- `nextSessionId` (nullable)
- `createdAt`

**Reason enum**:
- `adaptive_disabled`
- `always_isolated_stage`
- `low_usage_reuse`
- `mid_usage_conservative`
- `high_usage_guardrail`
- `missing_context_telemetry`
- `session_resume_unavailable`

**Alternatives considered**:
- Reuse `stage_requests`: rejected because approvals and policy decisions are different lifecycle concepts
- Keep only events in memory: rejected because the audit must survive process restarts and support later inspection

## Research Task 5: What is the right validation strategy?

**Question**: Which tests should prove the behavior without over-relying on fragile end-to-end agent runs?

### Decision: extend existing runner, backlog, DB, and UI tests; keep manual smoke tests secondary

**Rationale**:
- `tests/runner/execute.test.ts` already covers staged execution, approvals, and resume behavior
- `tests/db/repo-extended.test.ts` and `src/db/repo.ts` already cover usage persistence and context-window computation
- `tests/backlog/schema.test.ts`, `tests/db/backlogCatalog.test.ts`, and UI/catalog tests already validate resolved feature configuration
- This feature is primarily coordination logic, so deterministic mocked tests are the most valuable signal

**Required automated coverage**:
- schema/catalog parsing for `workflow.sessionPolicy`
- transition decisions for `<=50`, `>50 && <70`, `>=70`, and missing telemetry
- always-isolated override behavior
- adapter resume/new-session argument selection
- persistence of transition audit records
- UI/catalog rendering of resolved policy and reason strings

**Manual smoke coverage**:
- `npm run build`
- `npm run typecheck`
- targeted Vitest runs
- optional local `msq backlog load` + `msq run --feature ... --auto-advance-stages` once implementation lands
