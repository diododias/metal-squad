# Tasks: Backlog Auto-Pilot

**Input**: Design documents from `/specs/014-backlog-auto-pilot/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Add focused regression coverage for scheduler/orchestrator, runner lifecycle, catalog/web state, and config update surfaces because the spec explicitly requires validation for success handoff, blocked/failure skip, and protective-stop behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project layout at repo root: `src/` and `tests/`
- Core orchestration lives under `src/core/`
- Catalog persistence lives under `src/db/`
- Web/TUI surfaces live under `src/web/` and `src/ui/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the shared config contract and regression scaffolding required by every auto-pilot story.

- [X] T001 Add the `autoStart` feature flag to shared config contracts in `src/core/backlog/schema.ts` and `src/web/types.ts`
- [X] T002 [P] Thread resolved `autoStart` data through catalog projections in `src/db/backlogCatalog.ts`, `src/ui/catalog.ts`, and `src/web/state.ts`
- [X] T003 [P] Add baseline config/state regression coverage for `autoStart` defaults and pending-feature projections in `tests/ui/catalog.test.ts` and `tests/web/state.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core runtime primitives that MUST be complete before any user story can rely on automatic continuation.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Add explicit auto-pilot event contracts for blocked outcomes, failure kinds, and decision telemetry in `src/core/events/types.ts`
- [X] T005 [P] Broadcast the new runtime events through shared event wiring in `src/core/events/index.ts` and `src/web/server.ts`
- [X] T006 [P] Create shared outcome classification and next-candidate selection helpers in `src/core/orchestrator/autoPilot.ts`
- [X] T007 Wire live catalog feature re-reads into continuation decisions in `src/core/runner/execute.ts` and `src/db/backlogCatalog.ts`

**Checkpoint**: Foundation ready - user story implementation can now proceed with one auto-pilot decision path

---

## Phase 3: User Story 1 - Start the next eligible automatic feature after a success (Priority: P1) 🎯 MVP

**Goal**: Automatically hand off from a completed `autoStart` feature to the next eligible `autoStart` feature using the existing dependency-respecting order.

**Independent Test**: Start a backlog with at least two dependency-free `autoStart: true` features, let the first one finish successfully, and verify the second starts without manual input while a manual-only feature remains idle.

### Tests for User Story 1

- [X] T008 [P] [US1] Add success-handoff scheduler coverage for deterministic next-feature selection in `tests/orchestrator/autoPilot.test.ts` (selection logic lives in the new `autoPilot.ts` module, not `scheduler.ts`, which is unmodified — tests target the module that actually owns this behavior)
- [X] T009 [P] [US1] Add runner-level regression coverage for success-triggered auto-dispatch in `tests/runner/execute.test.ts`

### Implementation for User Story 1

- [X] T010 [US1] Implement success-triggered auto-pilot decisions in `src/core/orchestrator/autoPilot.ts`
- [X] T011 [US1] Integrate success-triggered continuation into `executeBacklog` in `src/core/runner/execute.ts`
- [X] T012 [US1] Preserve deterministic dependency order and single-start dedupe when dispatching the next feature — implemented in `src/core/orchestrator/autoPilot.ts`'s `selectNextAutoStartCandidate` (scheduler.ts itself needed no changes: auto-pilot only spawns a new detached process, it doesn't touch the in-process scheduler's own dispatch loop)

**Checkpoint**: User Story 1 should auto-start the next eligible automatic feature after a successful completion.

---

## Phase 4: User Story 2 - Keep backlog progress moving when an automatic feature blocks or fails for non-budget reasons (Priority: P2)

**Goal**: Leave blocked/failed features in place for recovery while continuing with the next eligible automatic feature after human-waiting or ordinary execution outcomes.

**Independent Test**: Trigger a human-waiting block and a non-budget execution failure on an `autoStart` feature, then verify another eligible `autoStart` feature starts while the original run stays blocked or failed.

### Tests for User Story 2

- [X] T013 [P] [US2] Add blocked-human and ordinary-failure continuation coverage in `tests/runner/execute.test.ts`
- [X] T014 [P] [US2] Add event/telemetry coverage for `run:blocked` and `autopilot:decision` broadcasting in `tests/web/server.test.ts`

### Implementation for User Story 2

- [X] T015 [US2] Emit dedicated `run:blocked` outcomes for gate and input waits in `src/core/runner/execute.ts`
- [X] T016 [US2] Distinguish ordinary execution failures from manual aborts in `src/core/runner/execute.ts` and `src/core/events/types.ts`
- [X] T017 [US2] Extend `src/core/orchestrator/autoPilot.ts` to continue after `blocked-human` and `failed-execution` outcomes without duplicating active features
- [X] T018 [US2] Surface blocked/failure auto-pilot decisions to web subscribers in `src/web/server.ts` (state.ts needed no change — decisions are transient broadcast events, not persisted state)

**Checkpoint**: User Story 2 should continue backlog progress after qualifying blocked or failed outcomes without erasing the original blocked/failed state.

---

## Phase 5: User Story 3 - Preserve manual control and budget safety boundaries (Priority: P3)

**Goal**: Keep automatic continuation opt-in, never auto-start manual-only features, and stop automatic dispatch when budget or token protection is hit.

**Independent Test**: Mix `autoStart: true` and `autoStart: false` features, trigger a budget or token protective stop, and verify only automatic features are considered while protective stops prevent further automatic starts.

### Tests for User Story 3

- [X] T019 [P] [US3] Add manual-only skip and protective-stop regression coverage in `tests/runner/execute.test.ts`
- [X] T020 [P] [US3] Add config patch and UI projection coverage for the `autoStart` flag in `tests/web/server.test.ts`, `tests/ui/render.test.tsx`, and `tests/ui/components.test.tsx`

### Implementation for User Story 3

- [X] T021 [US3] Exclude manual-only features from automatic candidate selection in `src/core/orchestrator/autoPilot.ts` and `src/ui/catalog.ts` (catalog.ts already threads `autoStart` through per T002; selection filter lives in autoPilot.ts)
- [X] T022 [US3] Treat budget/token stops as hard auto-pilot stop conditions in `src/core/runner/execute.ts` and `src/core/orchestrator/autoPilot.ts`
- [X] T023 [US3] Accept and persist `autoStart` edits from the web control surface in `src/web/types.ts`, `src/web/server.ts`, and `src/db/backlogCatalog.ts`
- [X] T024 [US3] Expose the `autoStart` flag in operator-facing config views in `src/web/static/components/FeaturePreview.js` and `src/ui/components/FeatureConfigSection.tsx`

**Checkpoint**: User Story 3 should respect manual-only boundaries and preserve protective stop behavior.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final observability, documentation, and validation across all stories

- [ ] T025 [P] Document the new `autoStart` behavior and outcome rules in `docs/features/F45-piloto-automatico.md` and `README.md`
- [ ] T026 Run the focused validation flow from `specs/014-backlog-auto-pilot/quickstart.md` via `tests/orchestrator/scheduler.test.ts`, `tests/runner/execute.test.ts`, and `tests/web/server.test.ts`
- [ ] T027 Run the repo baseline validation referenced by `specs/014-backlog-auto-pilot/quickstart.md` and `package.json` with `rtk npm run build`, `rtk npm test`, and `rtk npm run typecheck`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion - delivers the MVP auto-start handoff
- **User Story 2 (Phase 4)**: Depends on Foundational completion and reuses the same auto-pilot decision path as US1
- **User Story 3 (Phase 5)**: Depends on Foundational completion and hardens the selector with manual-only and protective-stop boundaries
- **Polish (Phase 6)**: Depends on the user stories that are in scope being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start as soon as Phase 2 is done
- **User Story 2 (P2)**: Can start after Phase 2, but is safest after US1 establishes the success-path dispatch flow
- **User Story 3 (P3)**: Can start after Phase 2, but it builds on the same selector and event classification introduced for US1 and US2

### Within Each User Story

- Focused regression tests should be added before the implementation tasks they cover
- Event/type contract changes should land before web/TUI subscribers depend on them
- Selector logic should be centralized in `src/core/orchestrator/autoPilot.ts` before adding story-specific branches in `execute.ts`

### Parallel Opportunities

- `T002` and `T003` can run in parallel after `T001`
- `T005` and `T006` can run in parallel after `T004`
- `T008` and `T009` can run in parallel for US1
- `T013` and `T014` can run in parallel for US2
- `T019` and `T020` can run in parallel for US3
- `T025` can run in parallel with validation tasks once feature behavior is stable

---

## Parallel Example: User Story 1

```bash
# Launch the focused US1 regressions together:
Task: "Add success-handoff scheduler coverage in tests/orchestrator/scheduler.test.ts"
Task: "Add runner-level regression coverage for success-triggered auto-dispatch in tests/runner/execute.test.ts"

# Then implement the selector and runtime integration in sequence:
Task: "Implement success-triggered auto-pilot decisions in src/core/orchestrator/autoPilot.ts"
Task: "Integrate success-triggered continuation into executeBacklog in src/core/runner/execute.ts"
```

---

## Parallel Example: User Story 2

```bash
# Launch the blocked/failure regressions together:
Task: "Add blocked-human and ordinary-failure continuation coverage in tests/runner/execute.test.ts"
Task: "Add event/telemetry coverage for run:blocked and autopilot:decision broadcasting in tests/web/server.test.ts"
```

---

## Parallel Example: User Story 3

```bash
# Launch the policy-boundary regressions together:
Task: "Add manual-only skip and protective-stop regression coverage in tests/runner/execute.test.ts"
Task: "Add config patch and UI projection coverage for the autoStart flag in tests/web/server.test.ts, tests/ui/render.test.tsx, and tests/ui/components.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate success handoff before expanding into blocked/failure handling

### Incremental Delivery

1. Deliver schema/event foundations first so every later story uses one contract
2. Ship US1 to prove automatic continuation after success
3. Add US2 to keep backlog progress moving after human-waiting or non-budget failures
4. Add US3 to enforce manual-only and protective-stop boundaries
5. Finish with docs and the required validation commands

### Parallel Team Strategy

1. One developer handles schema/catalog/event foundations
2. After Phase 2, one developer can own US1/US2 runner logic while another wires web/TUI config and telemetry for US3
3. Merge again in Phase 6 for validation and documentation
