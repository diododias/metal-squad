# Tasks: Web Action State Auto Refresh

**Input**: Design documents from `/specs/008-web-action-auto-refresh/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Targeted regression coverage is required by the feature research and quickstart, so test tasks are included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new setup scaffolding is required; the existing web server, browser app, and Vitest harness already cover the affected areas.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared authoritative refresh pipeline that every story depends on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 Create a shared `reconcileWebState()` helper that rebuilds `buildMsqWebState()`, detects meaningful snapshot changes, and centralizes `state:full` broadcasting in `src/web/server.ts`
- [X] T002 Create a shared subscription refresh helper for `run:detail`, `run:history`, and `run:changes` so the same reconciliation cycle can refresh all subscribed surfaces in `src/web/server.ts`
- [X] T003 [P] Rework execution-owned pending projection so blocked runs are excluded from `pendingFeatures` alongside running and done runs in `src/web/state.ts`

**Checkpoint**: Same-process and cross-process refresh logic now have one authoritative server pipeline, and pending/TODO projection can no longer treat blocked executions as still waiting to start.

---

## Phase 3: User Story 1 - Refresh run controls instantly (Priority: P1) 🎯 MVP

**Goal**: Run control actions update status, controls, and board placement immediately after the action result returns.

**Independent Test**: Trigger pause, resume, stop, abort, and feature-abort actions from the web UI and verify the initiating surface plus any visible run detail refresh automatically without a manual reload.

### Tests for User Story 1

- [X] T004 [US1] Add websocket regression coverage for `action:pausePipeline`, `action:resumePipeline`, `action:abortPipeline`, and `action:requestFeatureAbort` rebroadcasting refreshed `state:full` payloads in `tests/web/server.test.ts`

### Implementation for User Story 1

- [X] T005 [US1] Route run-control action handlers through the shared reconciliation helper in `src/web/server.ts`
- [X] T006 [US1] Refresh subscribed run-detail payloads after run-control mutations in `src/web/server.ts`
- [X] T007 [US1] Reconcile selected run state and action affordances from the latest `state:full` snapshot after run-control updates in `src/web/static/app.js`

**Checkpoint**: Pause, resume, stop, abort, and feature-abort flows refresh both overview and detail state without pressing F5.

---

## Phase 4: User Story 2 - Resolve blockers without manual refresh (Priority: P1)

**Goal**: Approve, skip, retry, and force-resolve actions clear blocked state everywhere it is visible during the same session.

**Independent Test**: Resolve a gate or stage request from one web surface and verify blocker lists, run status, and next available controls refresh automatically across all visible surfaces.

### Tests for User Story 2

- [X] T008 [US2] Add websocket regression coverage for `action:resolveGate`, `action:forceResolveGate`, and `action:resolveStageRequest` refreshing blockers and `state:full` payloads in `tests/web/server.test.ts`

### Implementation for User Story 2

- [X] T009 [US2] Route gate and stage-request resolution actions through the shared reconciliation helper in `src/web/server.ts`
- [X] T010 [US2] Refresh subscribed run-history and run-changes payloads when blocker resolution advances or unblocks a run in `src/web/server.ts`
- [X] T011 [US2] Clear stale blocker selection and gate-derived affordances after refreshed snapshots remove a resolved blocker in `src/web/static/app.js`

**Checkpoint**: Blocked runs stop looking blocked as soon as the resolution is accepted, without leaving stale blocker controls behind.

---

## Phase 5: User Story 3 - Keep shared views in sync (Priority: P2)

**Goal**: Dashboard, detail, and backlog-derived views converge on the same authoritative state after start actions and other cross-process updates.

**Independent Test**: Start a feature and perform follow-up actions while the same work item is visible in multiple web surfaces; verify the item leaves TODO/pending, appears in execution views, and never settles in conflicting states.

### Tests for User Story 3

- [X] T012 [US3] Add websocket regression coverage for detached `action:startFeature` reconciliation, duplicate pending/execution prevention, and latest-state ordering in `tests/web/server.test.ts`
- [X] T013 [P] [US3] Add focused `buildMsqWebState()` coverage for blocked and newly-started runs affecting `pendingFeatures` in `tests/web/state.test.ts`

### Implementation for User Story 3

- [X] T014 [US3] Add a bounded reconciliation poll for detached runner mutations that reuses the shared snapshot diffing and subscription refresh pipeline in `src/web/server.ts`
- [X] T015 [US3] Keep selected run, feature, and TODO/execution navigation state consistent when refreshed snapshots move an item between surfaces in `src/web/static/app.js`

**Checkpoint**: Start actions and detached runner updates converge all shared surfaces on the same final state, including TODO removal and execution placement.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Lock the contract, validation flow, and final regression pass after all stories land.

- [X] T016 [P] Update the observable refresh contract to match the implemented same-process and detached-process synchronization behavior in `specs/008-web-action-auto-refresh/contracts/web-state-refresh.md`
- [X] T017 [P] Update manual validation steps for run controls, blocker resolution, shared-view sync, and failed actions in `specs/008-web-action-auto-refresh/quickstart.md`
- [X] T018 Run the targeted build and regression commands documented in `specs/008-web-action-auto-refresh/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - already satisfied by the existing repo layout
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational completion
- **Polish (Phase 6)**: Depends on all target user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Starts immediately after Foundational - recommended MVP slice
- **User Story 2 (P1)**: Starts immediately after Foundational - shares the same server reconciliation primitives as US1
- **User Story 3 (P2)**: Starts immediately after Foundational, but should land after the shared server reconciliation helpers from T001-T002 exist

### Within Each User Story

- **US1**: Write the websocket regression first, then route run-control actions through reconciliation, then align detail/action affordances
- **US2**: Write the blocker refresh regression first, then wire blocker actions into reconciliation, then clean stale blocker UI state
- **US3**: Add start/reconciliation regressions, then implement detached-process polling, then align navigation/selection state with the refreshed snapshot

### Parallel Opportunities

- **Foundational**: T003 can proceed in parallel with T001-T002 because it is isolated to `src/web/state.ts`
- **US1**: No safe same-story parallel split after T004 because the implementation tasks share `src/web/server.ts` and depend on the same reconciliation path
- **US2**: No safe same-story parallel split after T008 because the implementation tasks share `src/web/server.ts` and the same blocker transition flow
- **US3**: T012 and T013 can run in parallel because they target different test files
- **Polish**: T016 and T017 can run in parallel because they update different documentation files

---

## Parallel Example: User Story 1

```bash
# No safe same-story parallel split after the regression test lands.
# Complete T004 first, then sequence T005-T007 through the shared refresh path.
```

---

## Parallel Example: User Story 2

```bash
# No safe same-story parallel split after the regression test lands.
# Complete T008 first, then sequence T009-T011 through the blocker refresh path.
```

---

## Parallel Example: User Story 3

```bash
# Launch the detached-refresh regressions together:
Task: "Add websocket regression coverage for detached action:startFeature reconciliation, duplicate pending/execution prevention, and latest-state ordering in tests/web/server.test.ts"
Task: "Add focused buildMsqWebState() coverage for blocked and newly-started runs affecting pendingFeatures in tests/web/state.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational
2. Complete Phase 3: User Story 1
3. **STOP and VALIDATE**: Run the targeted run-control regression and quickstart scenario for US1
4. Demo or ship the MVP once run controls refresh reliably

### Incremental Delivery

1. Complete Foundational → authoritative refresh pipeline ready
2. Add User Story 1 → validate run controls
3. Add User Story 2 → validate blocker resolution
4. Add User Story 3 → validate detached start and cross-surface sync
5. Finish Polish → contract/docs aligned and targeted regression pass complete

### Parallel Team Strategy

1. Team completes Foundational together
2. After Foundational:
   - Developer A: User Story 1
   - Developer B: User Story 2
3. Once the shared helper path is stable:
   - Developer C: User Story 3
4. Finish with documentation and regression validation in Phase 6

---

## Notes

- `tests/web/server.test.ts` is the primary regression surface for this feature because the stale-state bug sits in the websocket synchronization contract
- `tests/web/state.test.ts` is intentionally scoped to `buildMsqWebState()` so pending/TODO projection rules can be validated without websocket setup
- `failed` and `aborted` runs remain eligible to reappear as pending work; the duplicate-visibility fix is specifically about execution-owned states such as `running` and `blocked`
- No new storage, schema migration, or external pub/sub dependency is expected for this feature
