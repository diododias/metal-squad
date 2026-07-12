# Data Model: Web Action State Auto Refresh

**Feature**: 008-web-action-auto-refresh  
**Date**: 2026-07-11

## Summary

This feature does not introduce a new persistence schema. It strengthens the relationships between existing web snapshot entities so they refresh coherently after control actions. The key design point is that multiple UI surfaces derive from the same authoritative server snapshot and must therefore share the same projection rules.

## Entity: Web Action (existing)

**Source**: `src/web/types.ts` → `WebSocketClientMessage` action variants  
**Persistence**: None directly; each action mutates existing DB state or starts a detached runner

| Field | Type | Notes |
|-------|------|-------|
| `type` | action discriminator | `action:startFeature`, `action:pausePipeline`, `action:resumePipeline`, `action:abortPipeline`, `action:requestFeatureAbort`, `action:resolveGate`, `action:forceResolveGate`, `action:resolveStageRequest` |
| target id | `featureId`, `pipelineId`, `gateId`, `requestId` | Identifies the entity being mutated |
| resolution payload | `decision` or `response` | Present only for blocker-resolution actions |

### Validation Rules

- Only known action message variants are accepted
- Each action must provide the identifier required by its variant
- Failed or rejected actions must not leave the client showing a false successful state

### State Transitions

`received` -> `applied in same process` or `delegated to detached child` -> `authoritative snapshot refreshed`

## Entity: Execution Snapshot (existing)

**Source**: `src/web/state.ts` → `MsqWebState.runs` derived from `listRunsForTui()`  
**Persistence**: SQLite `runs`, `pipelines`, `gates`, `stage_requests`, token usage tables

| Field | Type | Notes |
|-------|------|-------|
| `runId` | `number` | Primary run identifier in UI |
| `featureId` | `string` | Links execution state to feature/backlog views |
| `status` | `running` \| `blocked` \| `done` \| `failed` \| `aborted` | Display status consumed by kanban/detail surfaces |
| `pipelineId` | `number \| null` | Links run controls to pipeline actions |
| `pipelineStatus` | pipeline status or `null` | Needed for control affordances and blocked/paused interpretation |
| `gateId` | `number \| null` | Links runs to pending gate actions |
| `pendingStageRequestId` | `number \| null` | Links runs to stage-request actions |

### Validation Rules

- The execution snapshot must come from authoritative DB selectors, not client inference
- New snapshots replace prior values for the same `runId`
- When multiple updates happen in sequence, the most recent confirmed snapshot wins

### State Transitions

`todo/pending` -> `running` -> (`blocked` <-> `running`) -> `done` / `failed` / `aborted`

## Entity: Pending Feature Projection (derived, existing behavior corrected)

**Source**: `src/web/state.ts` → `pendingFeatures`  
**Persistence**: None; derived from feature catalog plus latest execution snapshot

| Field | Type | Notes |
|-------|------|-------|
| feature catalog entry | `FeatureCatalogEntry` | Original backlog/catalog definition |
| derived pending eligibility | boolean | Whether the feature should remain in TODO/backlog views |

### Validation Rules

- A feature must not appear in `pendingFeatures` if it currently has an execution representation that is already active or blocked
- A feature may reappear as pending after terminal states such as `failed` or `aborted`, depending on the latest authoritative run state
- A feature already marked `done` must not reappear as pending

### State Transitions

`pending` -> `execution-owned` when an active/blocked run exists -> `terminal` (`done`) or `retryable pending` (`failed`/`aborted`)

## Entity: Shared View State (existing)

**Source**: `MsqWebState` plus active subscriptions (`run:detail`, `run:history`, `run:changes`)  
**Persistence**: None; runtime snapshot only

| Surface | Depends On |
|---------|------------|
| Dashboard / kanban columns | `runs`, `pendingFeatures`, `gates`, `stats` |
| Run detail header/actions | selected `run` from `runs` |
| Gates panel | `gates` |
| Feature preview / TODO views | `pendingFeatures`, `featureCatalog`, run history |
| Detail tabs | `run:detail`, `run:history`, `run:changes` plus selected run from `runs` |

### Validation Rules

- All surfaces in one browser session must converge on the same latest snapshot after a supported action
- Derived surfaces cannot preserve a stale copy once the authoritative state says the entity moved elsewhere
- Detail/history/changes subscriptions must be refreshed from the same authoritative cycle as the shared snapshot

## Entity: Refresh Cycle (new runtime behavior)

**Source**: web server reconciliation logic in `src/web/server.ts`  
**Persistence**: None

| Step | Description |
|------|-------------|
| `trigger` | Same-process action completion, event-bus fast path, or periodic cross-process reconciliation tick |
| `rebuild` | Recompute authoritative state via `buildMsqWebState()` |
| `compare` | Detect whether the snapshot changed meaningfully |
| `broadcast` | Send `state:full` when changed and refresh subscribed detail/history/changes payloads as needed |

### Validation Rules

- Same-process actions should trigger an immediate refresh attempt
- Cross-process changes must be observed within the bounded reconciliation interval
- No `state:full` should be emitted for unchanged snapshots unless explicitly required by connection/auth flow

## Edge Cases

| Scenario | Expected Model Behavior |
|----------|-------------------------|
| Start action returns before detached child inserts a run | The refresh loop keeps reconciling until the new run enters `runs` and the feature leaves `pendingFeatures` |
| Gate or stage request is resolved but the underlying pipeline remains blocked for another reason | The next authoritative snapshot reflects the true remaining blocked state |
| Two actions occur in quick succession on the same pipeline | Later authoritative state replaces earlier visible state; no stale final snapshot persists |
| Failed action or rejected resolution | UI re-renders to the unchanged authoritative state and surfaces the failure feedback |
