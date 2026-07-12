# Tasks: Adaptive Session Reuse Between Steps

**Input**: Design documents from `/specs/011-adaptive-session-reuse/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Include automated coverage because the design artifacts explicitly require runner, adapter, DB, and read-surface validation for the adaptive thresholds and audit trail.

**Organization**: Tasks are grouped by user story so each increment can be implemented and tested independently.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Refresh the shared fixtures and validation references that the rest of the feature will use.

- [X] T001 Refresh adaptive session-policy fixtures and transition expectations in `tests/runner/execute.test.ts` and `tests/db/repo-extended.test.ts`
- [X] T002 [P] Align the validation scenarios and audit examples in `specs/011-adaptive-session-reuse/quickstart.md` and `specs/011-adaptive-session-reuse/contracts/stage-transition-decision.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Align the shared transition-decision model, persistence layer, and stage handoff plumbing before story work branches out.

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [X] T003 Update the shared transition-decision reason model and threshold evaluation order in `src/core/workflow/sessionPolicy.ts`
- [X] T004 [P] Align stage-transition audit persistence and query helpers with the F41 reason set in `src/db/index.ts` and `src/db/repo.ts`
- [X] T005 [P] Update staged handoff orchestration to consume the shared transition plan consistently in `src/core/runner/execute.ts` and `src/core/events/types.ts`

**Checkpoint**: The runner, DB, and event contracts all agree on the same transition-decision vocabulary.

---

## Phase 3: User Story 1 - Configure Session Policy Per Feature (Priority: P1) 🎯 MVP

**Goal**: Let a backlog-managed feature declare whether adaptive reuse is enabled and which stages must always remain isolated.

**Independent Test**: Edit a staged feature in the backlog, reload the catalog, and verify the resolved config distinguishes `isolated`, `adaptive`, and `alwaysIsolatedStages`.

### Tests for User Story 1

- [X] T006 [P] [US1] Extend `workflow.sessionPolicy` default and validation coverage in `tests/backlog/schema.test.ts`
- [X] T007 [P] [US1] Extend catalog round-trip and feature-config rendering coverage in `tests/db/backlogCatalog.test.ts`, `tests/ui/components.test.tsx`, and `tests/ui/render.test.tsx`

### Implementation for User Story 1

- [X] T008 [US1] Tighten `sessionPolicy` parsing and stage-membership validation in `src/core/backlog/schema.ts`
- [X] T009 [US1] Preserve resolved `sessionPolicy` data through catalog load and patch flows in `src/db/backlogCatalog.ts` and `src/core/backlog/load.ts`
- [X] T010 [US1] Show the resolved session policy in `src/ui/catalog.ts`, `src/ui/components/FeatureConfigSection.tsx`, and `src/web/static/components/FeaturePreview.js`

**Checkpoint**: Feature configuration surfaces expose the effective adaptive-session policy without changing runtime behavior yet.

---

## Phase 4: User Story 2 - Reuse Session When Context Headroom Is High (Priority: P1)

**Goal**: Reuse the previous stage session automatically when adaptive mode is enabled, the next stage is eligible, and context usage stays in the reusable bands.

**Independent Test**: Run a staged feature with `sessionPolicy.mode = adaptive`, finish a stage at `<= 50%` and another at `>50% && <60%`, and verify the next eligible stage resumes the same provider session in both cases.

### Tests for User Story 2

- [X] T011 [P] [US2] Add runner coverage for `<=50%` and `>50% && <60%` reuse decisions in `tests/runner/execute.test.ts`
- [X] T012 [P] [US2] Add adapter resume-path coverage for reused sessions in `tests/adapters/codex-extended.test.ts`, `tests/adapters/misc.test.ts`, and `tests/adapters/opencode.test.ts`
- [X] T013 [P] [US2] Add reuse-audit coverage for persisted session handoff details in `tests/db/repo-extended.test.ts` and `tests/web/state.test.ts`

### Implementation for User Story 2

- [X] T014 [US2] Implement `low_usage_reuse`, `mid_usage_reuse`, and resume-unavailable fallback planning in `src/core/workflow/sessionPolicy.ts`
- [X] T015 [US2] Resume eligible next stages with the prior session handle in `src/core/runner/execute.ts`
- [X] T016 [US2] Persist and expose reuse decision details in `src/db/repo.ts` and `src/web/state.ts`

**Checkpoint**: Adaptive mode can preserve session continuity for the reusable context bands with auditable reuse records.

---

## Phase 5: User Story 3 - Apply Guardrails When Reuse Stops Being Safe (Priority: P2)

**Goal**: Force a fresh session whenever usage is high enough, telemetry is missing, or policy demands isolation, while recording the exact reason for the fallback.

**Independent Test**: Execute staged transitions with `alwaysIsolatedStages`, missing telemetry, `>=60% && <70%`, and `>=70%`, then verify each path starts a fresh session with the correct persisted reason.

### Tests for User Story 3

- [X] T017 [P] [US3] Add runner and DB coverage for always-isolated, missing-telemetry, `>=60% && <70%`, and `>=70%` branches in `tests/runner/execute.test.ts` and `tests/db/repo-extended.test.ts`
- [X] T018 [P] [US3] Add migration and read-surface coverage for the guardrail reasons in `tests/db/index-migrate.test.ts`, `tests/ui/hooks.test.ts`, and `tests/web/state.test.ts`

### Implementation for User Story 3

- [X] T019 [US3] Replace `mid_usage_conservative` with explicit `mid_usage_reuse`, `sixty_percent_guardrail`, and `high_usage_guardrail` outcomes in `src/core/workflow/sessionPolicy.ts`
- [X] T020 [US3] Enforce always-isolated and unreliable-telemetry fresh-session fallbacks in `src/core/runner/execute.ts`
- [X] T021 [US3] Normalize guardrail reason storage and latest-transition summaries in `src/db/repo.ts` and `src/core/events/types.ts`
- [X] T022 [US3] Expose guardrail and audit outcomes in `src/ui/hooks/useRuns.ts`, `src/ui/components/MainPanel.tsx`, and `src/web/static/components/RunDetail.js`

**Checkpoint**: Every risky or uncertain transition starts fresh and leaves a precise operational audit trail.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish docs, examples, and regression validation for the full feature.

- [X] T023 [P] Refresh the backlog-policy contract and validation walkthrough in `specs/011-adaptive-session-reuse/contracts/backlog-session-policy.md` and `specs/011-adaptive-session-reuse/quickstart.md`
- [X] T024 [P] Refresh adaptive-session examples and rollout notes in `backlog.yaml` and `docs/features/F41-adaptive-session-reuse.md`
- [X] T025 Run the adaptive-session regression matrix documented in `specs/011-adaptive-session-reuse/quickstart.md` against `tests/backlog/schema.test.ts`, `tests/db/backlogCatalog.test.ts`, `tests/runner/execute.test.ts`, `tests/db/repo-extended.test.ts`, `tests/adapters/codex-extended.test.ts`, `tests/adapters/misc.test.ts`, `tests/adapters/opencode.test.ts`, `tests/ui/hooks.test.ts`, `tests/ui/render.test.tsx`, and `tests/web/state.test.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1) starts immediately.
- Foundational (Phase 2) depends on Phase 1 and blocks all story work.
- User Story 1 (Phase 3) depends on Phase 2.
- User Story 2 (Phase 4) depends on Phase 2 and on the `sessionPolicy` contract from User Story 1.
- User Story 3 (Phase 5) depends on Phase 2 and extends the transition logic delivered in User Story 2.
- Polish (Phase 6) depends on the stories you intend to ship.

### User Story Dependencies

- US1 is the MVP and the first safe delivery slice.
- US2 requires US1 because adaptive reuse depends on the backlog/session-policy contract being present and visible.
- US3 requires US2 because the guardrail and audit paths extend the same transition-decision flow.

### Within Each User Story

- Write the listed tests first and confirm they fail before implementation.
- Align shared reason types before changing runner branching or read-surface rendering.
- Persist audit changes before depending on them in TUI or web readers.
- Validate each story independently before moving to the next priority.

---

## Parallel Opportunities

- Phase 1: `T002` can run in parallel once `T001` defines the refreshed scenarios.
- Phase 2: `T004` and `T005` can run in parallel after `T003`.
- US1: `T006` and `T007` can run in parallel; `T009` and `T010` can split once `T008` is complete.
- US2: `T011`, `T012`, and `T013` can run in parallel; `T015` and `T016` can split once `T014` defines the reusable paths.
- US3: `T017` and `T018` can run in parallel; `T021` and `T022` can split once `T019` defines the final reason model.
- Polish: `T023` and `T024` can run in parallel before `T025`.

---

## Parallel Example: User Story 1

```bash
# Launch the backlog/config coverage together:
T006 tests/backlog/schema.test.ts
T007 tests/db/backlogCatalog.test.ts + tests/ui/components.test.tsx + tests/ui/render.test.tsx
```

## Parallel Example: User Story 2

```bash
# Validate reuse behavior across runner, adapters, and audit readers:
T011 tests/runner/execute.test.ts
T012 tests/adapters/codex-extended.test.ts + tests/adapters/misc.test.ts + tests/adapters/opencode.test.ts
T013 tests/db/repo-extended.test.ts + tests/web/state.test.ts
```

## Parallel Example: User Story 3

```bash
# Exercise guardrails and operational readers together:
T017 tests/runner/execute.test.ts + tests/db/repo-extended.test.ts
T018 tests/db/index-migrate.test.ts + tests/ui/hooks.test.ts + tests/web/state.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Deliver Phase 3 so features can declare and display `sessionPolicy`.
3. Validate the backlog/catalog/UI contract independently before changing runtime behavior.

### Incremental Delivery

1. Add the reusable context bands in Phase 4 once the config contract is stable.
2. Add the `60%` and `70%` guardrails plus missing-telemetry fallback in Phase 5.
3. Finish with docs, examples, and regression validation in Phase 6.

### Suggested MVP Scope

- Ship through Phase 3 (US1) for the first reviewable increment.
- Add Phase 4 (US2) next to unlock the main product value.
- Add Phase 5 (US3) before calling the feature production-ready.
