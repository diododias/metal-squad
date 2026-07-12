# Tasks: Step-Scoped Custom Guidance

**Input**: Design documents from `/specs/015-step-custom-guidance/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Add focused regression coverage for backlog schema/loading, prompt assembly, skill validation, and staged runner execution because the spec requires named-skill validation, no-regression guarantees, and retry/resume parity.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. `US1`, `US2`, `US3`)
- Include exact file paths in descriptions

## Path Conventions

- Single project layout at repo root: `src/` and `tests/`
- Backlog schema/loading and prompt assembly live under `src/core/backlog/`
- Canonical skill discovery and validation live under `src/core/skills/`
- Staged execution lives under `src/core/runner/` and persistence under `src/db/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the shared contract surface and validation scaffolding that every story depends on.

- [x] T001 Capture the stage-guidance contract for implementation reference in `specs/015-step-custom-guidance/contracts/backlog-step-guidance.md` and `specs/015-step-custom-guidance/contracts/step-prompt-assembly.md`
- [x] T002 [P] Add baseline fixture coverage for staged workflow prompt assembly inputs in `tests/backlog/load-prompt.test.ts` and `tests/runner/execute.test.ts`
- [x] T003 [P] Add schema fixture coverage for `workflow.stepGuidance` defaults and valid stage-key parsing in `tests/backlog/schema.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core contract, validation, and prompt-building primitives that MUST exist before any story-specific behavior can be implemented safely.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Extend workflow and feature schemas to accept `workflow.stepGuidance` entries in `src/core/backlog/schema.ts`
- [x] T005 [P] Thread `workflow.stepGuidance` through YAML and catalog hydration in `src/core/backlog/load.ts` and `src/db/backlogCatalog.ts`
- [x] T006 [P] Extend backlog skill collection to include step-guidance skill references in `src/core/skills/backlog.ts`
- [x] T007 Add prompt-builder support for `activeStage`-scoped guidance inputs in `src/core/backlog/prompt.ts`
- [x] T008 Add foundational regression coverage for schema hydration, catalog parity, and skill collection in `tests/backlog/schema.test.ts`, `tests/backlog/load-extended.test.ts`, and `tests/core/skills-backlog.test.ts`

**Checkpoint**: Foundation ready - user story implementation can now proceed on one validated stage-guidance contract.

---

## Phase 3: User Story 1 - Guide one specific step with extra instructions (Priority: P1) 🎯 MVP

**Goal**: Allow one workflow stage to receive additive named-skill and/or direct prompt guidance without changing prompts for untouched stages.

**Independent Test**: Configure a staged feature where only one stage declares step guidance, assemble prompts for the targeted and untouched stages, and confirm only the targeted stage changes while the untouched stage stays byte-equivalent to current behavior.

### Tests for User Story 1

- [x] T009 [P] [US1] Add prompt regression coverage for single-stage named guidance and direct prompt injection in `tests/backlog/load-prompt.test.ts`
- [x] T010 [P] [US1] Add prompt ordering and whitespace-ignore coverage for stage guidance in `tests/backlog/prompt-extended.test.ts`

### Implementation for User Story 1

- [x] T011 [US1] Implement stage-key lookup and additive guidance extraction in `src/core/backlog/prompt.ts`
- [x] T012 [US1] Render step-guidance skill prompts and direct prompt blocks in deterministic order in `src/core/backlog/prompt.ts`
- [x] T013 [US1] Pass the active workflow stage into prompt assembly from staged execution in `src/core/runner/execute.ts`
- [x] T014 [US1] Preserve unchanged prompt output for stages without custom guidance in `src/core/backlog/prompt.ts` and `tests/backlog/load-prompt.test.ts`

**Checkpoint**: User Story 1 should make one targeted stage prompt visibly different without altering untouched stages.

---

## Phase 4: User Story 2 - Reuse the existing skill registry for named step guidance (Priority: P2)

**Goal**: Resolve named stage-guidance skills through the same registry precedence and failure behavior already used elsewhere in the product.

**Independent Test**: Reference a stage-guidance skill name that exists in more than one source and verify the winning source matches the shared registry; then reference a missing name and confirm validation fails before execution with the standard missing-skill error.

### Tests for User Story 2

- [x] T015 [P] [US2] Add backlog validation coverage for resolved and missing step-guidance skill references in `tests/core/skills-backlog.test.ts`
- [x] T016 [P] [US2] Add precedence regression coverage for step-guidance skill resolution in `tests/core/skills-registry-mock.test.ts` and `tests/backlog/load-extended.test.ts`

### Implementation for User Story 2

- [x] T017 [US2] Reuse canonical skill-resolution and validation paths for `workflow.stepGuidance.*.skills` in `src/core/skills/backlog.ts` and `src/core/skills/registry.ts`
- [x] T018 [US2] Reject missing named step-guidance skills during backlog validation in `src/core/backlog/load.ts` and `tests/core/skills-backlog.test.ts`
- [x] T019 [US2] Deduplicate inherited and step-guidance skills by skill name before rendering in `src/core/backlog/prompt.ts`

**Checkpoint**: User Story 2 should keep one precedence model and one missing-skill failure contract for normal and step-scoped guidance.

---

## Phase 5: User Story 3 - Add step guidance without breaking existing features (Priority: P3)

**Goal**: Preserve inherited guidance, catalog-backed behavior, and retry/resume determinism when only some stages define custom guidance.

**Independent Test**: Assemble prompts for a feature with inherited guidance plus one customized stage from both YAML-backed and catalog-backed paths, then repeat the same stage through retry/resume coverage and confirm ordering and untouched-stage behavior remain stable.

### Tests for User Story 3

- [x] T020 [P] [US3] Add catalog-backed parity coverage for inherited plus step-specific guidance in `tests/backlog/load-extended.test.ts`
- [x] T021 [P] [US3] Add runner retry/resume regression coverage for active-stage guidance persistence in `tests/runner/execute.test.ts`

### Implementation for User Story 3

- [x] T022 [US3] Preserve inherited feature/stage guidance while appending step guidance in `src/core/backlog/prompt.ts`
- [x] T023 [US3] Ensure catalog serialization and rehydration keep `workflow.stepGuidance` unchanged in `src/db/backlogCatalog.ts` and `src/core/backlog/load.ts`
- [x] T024 [US3] Rebuild the same customized prompt for repeated staged executions in `src/core/runner/execute.ts`

**Checkpoint**: User Story 3 should keep existing features stable while customized stages remain deterministic across catalog loads and repeated runs.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final documentation and validation across all stories

- [x] T025 [P] Document `workflow.stepGuidance` authoring and prompt-order guarantees in `docs/features/F46-custom-prompt-per-step.md`
- [x] T026 Run the focused validation flow from `specs/015-step-custom-guidance/quickstart.md` with `rtk npx vitest run tests/backlog/schema.test.ts tests/backlog/load-prompt.test.ts tests/backlog/load-extended.test.ts tests/backlog/prompt-extended.test.ts tests/core/skills-backlog.test.ts tests/core/skills-registry-mock.test.ts tests/runner/execute.test.ts`
- [x] T027 Run the repo baseline validation for this feature with `rtk npm run build`, `rtk npm test`, and `rtk npm run typecheck`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion - delivers the MVP targeted-stage guidance behavior
- **User Story 2 (Phase 4)**: Depends on Foundational completion and builds on the shared skill-collection and prompt-builder primitives
- **User Story 3 (Phase 5)**: Depends on Foundational completion and is safest after US1 and US2 establish prompt composition plus shared resolution behavior
- **Polish (Phase 6)**: Depends on the user stories in scope being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start as soon as Phase 2 is done
- **User Story 2 (P2)**: Can start after Phase 2, but is safest after US1 proves stage-specific prompt injection
- **User Story 3 (P3)**: Can start after Phase 2, but it builds on the same prompt assembly and registry behavior established by US1 and US2

### Within Each User Story

- Focused regression tests should be added before the implementation tasks they cover
- Schema and hydration changes must land before runner and prompt paths depend on the new data
- Prompt assembly should stay centralized in `src/core/backlog/prompt.ts`, with the runner only passing `activeStage`

### Parallel Opportunities

- `T002` and `T003` can run in parallel during setup
- `T005` and `T006` can run in parallel after `T004`
- `T009` and `T010` can run in parallel for US1
- `T015` and `T016` can run in parallel for US2
- `T020` and `T021` can run in parallel for US3
- `T025` can run in parallel with `T026` and `T027` once feature behavior is stable

---

## Parallel Example: User Story 1

```bash
# Launch the focused US1 prompt regressions together:
Task: "Add prompt regression coverage for single-stage named guidance and direct prompt injection in tests/backlog/load-prompt.test.ts"
Task: "Add prompt ordering and whitespace-ignore coverage for stage guidance in tests/backlog/prompt-extended.test.ts"
```

---

## Parallel Example: User Story 2

```bash
# Launch the focused US2 skill-resolution regressions together:
Task: "Add backlog validation coverage for resolved and missing step-guidance skill references in tests/core/skills-backlog.test.ts"
Task: "Add precedence regression coverage for step-guidance skill resolution in tests/core/skills-registry-mock.test.ts and tests/backlog/load-extended.test.ts"
```

---

## Parallel Example: User Story 3

```bash
# Launch the focused US3 persistence regressions together:
Task: "Add catalog-backed parity coverage for inherited plus step-specific guidance in tests/backlog/load-extended.test.ts"
Task: "Add runner retry/resume regression coverage for active-stage guidance persistence in tests/runner/execute.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate that one stage prompt changes while untouched stages stay byte-equivalent

### Incremental Delivery

1. Land schema, hydration, and prompt-building foundations first
2. Deliver US1 to prove targeted-stage additive guidance
3. Deliver US2 to guarantee shared registry precedence and missing-skill validation
4. Deliver US3 to harden inherited guidance, catalog parity, and retry/resume determinism
5. Finish with documentation and the required validation commands

### Parallel Team Strategy

1. One developer can own schema/hydration work while another prepares focused regression tests
2. After Phase 2, prompt assembly work (US1/US3) and registry-validation work (US2) can proceed with limited file overlap
3. Rejoin in Phase 6 for quickstart validation and documentation

---

## Notes

- [P] tasks touch different files and can be executed independently once their prerequisites are satisfied
- Story labels map every story-phase task back to the originating user story
- Each user story defines an independent verification path before later phases build on it
- All tasks follow the required checklist format with checkbox, task ID, optional `[P]`, required story label in story phases, and exact file paths
