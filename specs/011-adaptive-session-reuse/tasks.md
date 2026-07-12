# Tasks: Adaptive Session Reuse Between Steps

**Input**: Design documents from `/specs/011-adaptive-session-reuse/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Include automated coverage because the feature spec explicitly requires threshold, stage-isolation, and regression validation.

**Organization**: Tasks are grouped by user story so each increment can be implemented and tested independently.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the shared domain scaffolding that every story builds on.

- [x] T001 Create the shared session-policy decision module in `src/core/workflow/sessionPolicy.ts`
- [x] T002 [P] Extend adapter run contracts for continuation handles in `src/core/adapters/types.ts`
- [x] T003 [P] Add transition-decision event payload types in `src/core/events/types.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the core persistence and stage-handoff plumbing required before any user story can land.

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [x] T004 Add the SQLite migration for stage transition audits in `src/db/index.ts`
- [x] T005 [P] Add repository helpers for persisting and reading transition decisions in `src/db/repo.ts`
- [x] T006 [P] Add shared staged-session fixtures for follow-up tests in `tests/runner/execute.test.ts` and `tests/db/repo-extended.test.ts`
- [x] T007 Wire stage handoff orchestration to the session-policy helper in `src/core/runner/execute.ts`

**Checkpoint**: Shared session-policy types, persistence, and runner wiring exist so story work can proceed safely.

---

## Phase 3: User Story 1 - Configure Session Policy Per Feature (Priority: P1) 🎯 MVP

**Goal**: Let backlog-managed features declare whether adaptive reuse is enabled and which stages must always stay isolated.

**Independent Test**: Edit a staged feature in the backlog, reload the catalog, and verify the resolved config distinguishes `isolated`, `adaptive`, and `alwaysIsolatedStages`.

### Tests for User Story 1

- [x] T008 [P] [US1] Add failing schema cases for `workflow.sessionPolicy` defaults and invalid stage ids in `tests/backlog/schema.test.ts`
- [x] T009 [P] [US1] Add catalog round-trip coverage for `sessionPolicy` persistence in `tests/db/backlogCatalog.test.ts`
- [x] T010 [P] [US1] Add feature-config rendering assertions for session policy in `tests/ui/components.test.tsx` and `tests/ui/render.test.tsx`

### Implementation for User Story 1

- [x] T011 [US1] Extend workflow schema defaults and validation for `sessionPolicy` in `src/core/backlog/schema.ts`
- [x] T012 [US1] Persist and reload `sessionPolicy` through the backlog catalog in `src/db/backlogCatalog.ts` and `src/core/backlog/load.ts`
- [x] T013 [US1] Surface the resolved session policy in `src/ui/catalog.ts` and `src/ui/components/FeatureConfigSection.tsx`

**Checkpoint**: Features can declare adaptive-vs-isolated session policy and the resolved config is visible in read surfaces.

---

## Phase 4: User Story 2 - Reuse Session When Context Headroom Is High (Priority: P1)

**Goal**: Reuse the prior stage session automatically when adaptive mode is enabled, the next stage is eligible, and context usage is at or below 50%.

**Independent Test**: Run a staged feature with `sessionPolicy.mode = adaptive`, finish a stage at `<= 50%` context usage, and verify the next eligible stage resumes the same provider session.

### Tests for User Story 2

- [x] T014 [P] [US2] Add failing low-usage reuse and stage-opt-out coverage in `tests/runner/execute.test.ts`
- [x] T015 [P] [US2] Add adapter resume/new-session flag coverage in `tests/adapters/codex-extended.test.ts`, `tests/adapters/opencode.test.ts`, and `tests/adapters/misc.test.ts`

### Implementation for User Story 2

- [x] T016 [US2] Implement low-usage reuse and stage-exception decision rules in `src/core/workflow/sessionPolicy.ts`
- [x] T017 [US2] Capture provider session handles in run results from `src/core/adapters/codex.ts`, `src/core/adapters/claude.ts`, and `src/core/adapters/opencode.ts`
- [x] T018 [US2] Resume eligible next stages with the prior session handle in `src/core/runner/execute.ts`

**Checkpoint**: Adaptive mode can keep session continuity for low-usage transitions without regressing always-isolated stages.

---

## Phase 5: User Story 3 - Force New Sessions for Risky or Uncertain Transitions (Priority: P2)

**Goal**: Open a fresh session whenever usage is conservative/high, telemetry is missing, or policy requires isolation, while recording an auditable reason.

**Independent Test**: Execute staged transitions with `50 < usage < 70`, `>= 70`, missing telemetry, and always-isolated next stages, then verify each transition forces a new session with the correct persisted reason.

### Tests for User Story 3

- [x] T019 [P] [US3] Add failing conservative/high-usage/missing-telemetry audit cases in `tests/runner/execute.test.ts`, `tests/db/repo-extended.test.ts`, and `tests/db/index-migrate.test.ts`
- [x] T020 [P] [US3] Add operational read-surface coverage for transition reasons in `tests/web/state.test.ts` and `tests/ui/hooks.test.ts`

### Implementation for User Story 3

- [x] T021 [US3] Implement conservative, guardrail, and missing-telemetry branches in `src/core/workflow/sessionPolicy.ts`
- [x] T022 [US3] Persist stage transition audit rows and query helpers in `src/db/index.ts` and `src/db/repo.ts`
- [x] T023 [US3] Emit `stage:transition-decided` and store fallback session ids in `src/core/events/index.ts` and `src/core/runner/execute.ts`
- [x] T024 [US3] Expose transition decision history to operational readers in `src/web/state.ts` and `src/db/repo.ts`

**Checkpoint**: Every risky or uncertain transition starts fresh and leaves an auditable reason behind.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final documentation, examples, and regression validation across the completed feature.

- [x] T025 [P] Update the validation and audit-inspection steps in `specs/011-adaptive-session-reuse/quickstart.md`
- [x] T026 [P] Refresh adaptive-session examples in `backlog.yaml` and `docs/features/F41-adaptive-session-reuse.md`
- [x] T027 Execute the regression validation matrix documented in `specs/011-adaptive-session-reuse/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1) starts immediately.
- Foundational (Phase 2) depends on Phase 1 and blocks all story work.
- User Story 1 (Phase 3) depends on Phase 2.
- User Story 2 (Phase 4) depends on Phase 2 and the `sessionPolicy` contract from User Story 1.
- User Story 3 (Phase 5) depends on Phase 2 and builds on the transition logic introduced in User Story 2.
- Polish (Phase 6) depends on the stories you intend to ship.

### User Story Dependencies

- US1 is the MVP and the first safe delivery slice.
- US2 requires US1 because adaptive reuse needs the backlog/session-policy contract to exist.
- US3 requires US2 because the guardrail and audit paths extend the same transition-decision flow.

### Within Each User Story

- Write the listed tests first and confirm they fail before implementation.
- Apply schema and type changes before wiring runner or adapter behavior to them.
- Finish persistence before exposing new operational read surfaces.
- Validate each story independently before moving to the next priority.

---

## Parallel Opportunities

- Phase 1: `T002` and `T003` can run in parallel after `T001`.
- Phase 2: `T005` and `T006` can run in parallel after `T004`.
- US1: `T008`, `T009`, and `T010` can run in parallel; `T012` and `T013` can split once `T011` is complete.
- US2: `T014` and `T015` can run in parallel; adapter work inside `T017` can be split by provider.
- US3: `T019` and `T020` can run in parallel; `T022` and `T024` can be split once `T021` defines the final reason model.
- Polish: `T025` and `T026` can run in parallel before `T027`.

---

## Parallel Example: User Story 1

```bash
# Launch the story-specific failing tests together:
T008 tests/backlog/schema.test.ts
T009 tests/db/backlogCatalog.test.ts
T010 tests/ui/components.test.tsx + tests/ui/render.test.tsx
```

## Parallel Example: User Story 2

```bash
# Validate runner and adapter behavior in parallel:
T014 tests/runner/execute.test.ts
T015 tests/adapters/codex-extended.test.ts + tests/adapters/opencode.test.ts + tests/adapters/misc.test.ts
```

## Parallel Example: User Story 3

```bash
# Exercise persistence and read surfaces together:
T019 tests/db/index-migrate.test.ts + tests/db/repo-extended.test.ts + tests/runner/execute.test.ts
T020 tests/web/state.test.ts + tests/ui/hooks.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Deliver Phase 3 so features can declare and display `sessionPolicy`.
3. Validate the backlog/catalog/UI contract independently before changing runtime behavior.

### Incremental Delivery

1. Add the low-usage reuse path in Phase 4 once the config contract is stable.
2. Add the conservative/high-usage/missing-telemetry guardrails and audit trail in Phase 5.
3. Finish with docs/examples/regression validation in Phase 6.

### Suggested MVP Scope

- Ship through Phase 3 (US1) for the first reviewable increment.
- Add Phase 4 (US2) next to unlock the primary user value.
- Add Phase 5 (US3) before calling the feature production-ready.
