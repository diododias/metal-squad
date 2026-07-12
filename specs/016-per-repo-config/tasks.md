# Tasks: F22 - Per-Repo Config

**Input**: Design documents from `/specs/016-per-repo-config/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Add focused regression coverage because the spec requires strict precedence preservation, clear repo-config validation failures, env interpolation, and an inspectable resolved-config surface.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. `US1`, `US2`, `US3`)
- Include exact file paths in descriptions

## Path Conventions

- Single-project TypeScript layout at repo root: `src/` and `tests/`
- Global and repo config loading live under `src/config/`
- Backlog parsing and precedence propagation live under `src/core/backlog/`
- CLI command registration lives under `src/commands/`
- TUI/web config consumers live under `src/ui/` and `src/web/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Capture the repo-config contract and add baseline test scaffolding for the new resolution surface.

- [X] T001 Align the feature contract narrative and implementation notes in `specs/016-per-repo-config/contracts/config-resolution-contract.md` and `specs/016-per-repo-config/quickstart.md`
- [X] T002 [P] Add baseline config fixture coverage for repo-local config loading entry points in `tests/config/index.test.ts`
- [X] T003 [P] Add baseline backlog/default precedence fixtures for repo-level defaults in `tests/backlog/load-extended.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared resolver, schema, and normalization primitives that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Extend config schemas and exported types for repo-scoped runtime/default sections in `src/config/index.ts` and `src/core/backlog/schema.ts`
- [X] T005 [P] Add repo-root config path discovery, YAML parsing, and source-specific error reporting in `src/config/index.ts`
- [X] T006 [P] Implement recursive `${ENV_VAR}` interpolation with field-path-aware failures in `src/config/index.ts`
- [X] T007 Build a shared effective-config resolver that merges global config, repo config, and optional backlog context in `src/config/index.ts` and `src/core/backlog/load.ts`
- [X] T008 Thread repo-level execution defaults through backlog hydration and normalization in `src/core/backlog/load.ts` and `src/ui/catalog.ts`
- [X] T009 Add foundational regression coverage for schema validation, repo-config parsing, env interpolation, and backlog merge primitives in `tests/config/index.test.ts`, `tests/backlog/load-extended.test.ts`, and `tests/backlog/schema.test.ts`

**Checkpoint**: Foundation ready - runtime/config consumers can resolve one shared config view before story-specific surfaces are added.

---

## Phase 3: User Story 1 - Apply repo-specific defaults (Priority: P1) 🎯 MVP

**Goal**: Let one repository define local Metal Squad defaults that override global config without changing behavior in repos that do not opt in.

**Independent Test**: Create a repo-local `.msq/config.yaml`, load config from that repo, and confirm runtime/default values differ from the global baseline only for explicitly overridden fields while a repo without the file still resolves to current global behavior.

### Tests for User Story 1

- [X] T010 [P] [US1] Add config resolution regression coverage for repo overrides and missing-file fallback in `tests/config/index.test.ts`
- [X] T011 [P] [US1] Add backlog/runtime propagation coverage for repo defaults reaching feature catalog and backlog settings in `tests/backlog/load-extended.test.ts` and `tests/ui/catalog.test.ts`

### Implementation for User Story 1

- [X] T012 [US1] Apply repo runtime overrides on top of global config in `src/config/index.ts`
- [X] T013 [US1] Merge repo execution defaults into backlog-derived settings in `src/core/backlog/load.ts` and `src/ui/catalog.ts`
- [X] T014 [US1] Update runtime consumers to read the shared resolved config instead of raw global config in `src/commands/run.ts`, `src/commands/resume.ts`, `src/commands/status.ts`, and `src/core/notify/manager.ts`
- [X] T015 [US1] Preserve backward-compatible behavior for repos without `.msq/config.yaml` in `src/config/index.ts` and `tests/config/index.test.ts`

**Checkpoint**: User Story 1 should make one repository resolve different defaults without changing existing repos.

---

## Phase 4: User Story 2 - Preserve deeper override precedence (Priority: P2)

**Goal**: Keep backlog defaults and feature overrides as the most specific layers above the new repo-config layer.

**Independent Test**: Define conflicting values at global, repo, backlog, and feature levels, then verify the resolved result follows `global -> repo -> backlog -> feature` for CLI/runtime/UI consumers.

### Tests for User Story 2

- [X] T016 [P] [US2] Add precedence regression coverage for backlog-over-repo and feature-over-backlog resolution in `tests/backlog/load-extended.test.ts` and `tests/runner/execute.test.ts`
- [X] T017 [P] [US2] Add projection coverage for resolved backlog/feature settings in `tests/ui/catalog.test.ts` and `tests/web/state.test.ts`

### Implementation for User Story 2

- [X] T018 [US2] Extend the shared resolver to produce backlog-level and feature-level resolved views in `src/config/index.ts` and `src/core/backlog/load.ts`
- [X] T019 [US2] Reuse resolved defaults when building feature catalog and backlog settings views in `src/ui/catalog.ts` and `src/web/state.ts`
- [X] T020 [US2] Apply feature-level effective config precedence in execution paths that consume backlog/catalog data in `src/core/runner/execute.ts`, `src/commands/run.ts`, and `src/commands/decompose.ts`
- [X] T021 [US2] Keep stage-skills and workflow-related deep merges deterministic across repo/backlog/feature layers in `src/core/workflow/stageSkills.ts`, `src/core/backlog/load.ts`, and `tests/backlog/load-extended.test.ts`

**Checkpoint**: User Story 2 should prove the new repo layer does not weaken existing backlog and feature precedence rules.

---

## Phase 5: User Story 3 - Reference sensitive values safely (Priority: P3)

**Goal**: Support env-backed repo config values and expose an explicit resolved-config inspection command with clear failures for invalid repo config.

**Independent Test**: Define repo config values using `${ENV_VAR}`, inspect them through `msq config show`, confirm available env vars are substituted, and verify missing vars or invalid YAML fail with repo-config-specific errors.

### Tests for User Story 3

- [X] T022 [P] [US3] Add CLI coverage for `msq config show` human and JSON output plus unknown-feature failures in `tests/commands/commands.test.ts`
- [X] T023 [P] [US3] Add env interpolation and repo-config error coverage for web/TUI inspection consumers in `tests/config/index.test.ts`, `tests/web/state.test.ts`, and `tests/web/server.test.ts`

### Implementation for User Story 3

- [X] T024 [US3] Add the `config show` CLI command and resolved-config formatter in `src/commands/config.ts` and `tests/commands/commands.test.ts`
- [X] T025 [US3] Register the new config command in the CLI bootstrap path in `src/commands/index.ts` or the command-registration module used by `tests/cli.test.ts`
- [X] T026 [US3] Expose resolved config sources and effective values to TUI/web consumers through the shared resolver in `src/ui/commands/definitions.ts`, `src/web/state.ts`, and `src/web/server.ts`
- [X] T027 [US3] Surface repo-config validation and missing-env failures with `.msq/config.yaml` source context in `src/config/index.ts` and `tests/config/index.test.ts`

**Checkpoint**: User Story 3 should allow safe secret references and give users one explicit way to inspect the final resolved config.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation across all stories

- [X] T028 [P] Document repo-config authoring, precedence, and env placeholder behavior in `docs/features/F22-per-repo-config.md`
- [X] T029 [P] Run the focused validation flow from `specs/016-per-repo-config/quickstart.md` with `rtk npx vitest run tests/config/index.test.ts tests/backlog/schema.test.ts tests/backlog/load-extended.test.ts tests/ui/catalog.test.ts tests/runner/execute.test.ts tests/web/state.test.ts tests/web/server.test.ts tests/commands/commands.test.ts tests/cli.test.ts`
- [X] T030 Run the repo baseline validation for this feature with `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck`, and `rtk npm run lint`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion - delivers the MVP repo-local config behavior
- **User Story 2 (Phase 4)**: Depends on Foundational completion and builds on the shared resolver from Phase 2 plus the repo-layer behavior from US1
- **User Story 3 (Phase 5)**: Depends on Foundational completion and is safest after US1/US2 establish the final precedence model
- **Polish (Phase 6)**: Depends on all in-scope user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start as soon as Phase 2 is done
- **User Story 2 (P2)**: Can start after Phase 2, but should follow US1 because it extends the same resolution path with backlog/feature precedence
- **User Story 3 (P3)**: Can start after Phase 2, but is safest after US1 and US2 because `config show` must expose the final precedence model

### Within Each User Story

- Focused regression tests should be added before the implementation tasks they cover
- `src/config/index.ts` should remain the canonical home for repo-config loading and effective resolution primitives
- Backlog/catalog/TUI/web consumers should reuse resolved outputs instead of duplicating merge logic

### Parallel Opportunities

- `T002` and `T003` can run in parallel during setup
- `T005` and `T006` can run in parallel after `T004`
- `T010` and `T011` can run in parallel for US1
- `T016` and `T017` can run in parallel for US2
- `T022` and `T023` can run in parallel for US3
- `T028` and `T029` can run in parallel once feature behavior is stable

---

## Parallel Example: User Story 1

```bash
# Launch the focused US1 regressions together:
Task: "Add config resolution regression coverage for repo overrides and missing-file fallback in tests/config/index.test.ts"
Task: "Add backlog/runtime propagation coverage for repo defaults reaching feature catalog and backlog settings in tests/backlog/load-extended.test.ts and tests/ui/catalog.test.ts"
```

---

## Parallel Example: User Story 2

```bash
# Launch the focused US2 precedence regressions together:
Task: "Add precedence regression coverage for backlog-over-repo and feature-over-backlog resolution in tests/backlog/load-extended.test.ts and tests/runner/execute.test.ts"
Task: "Add projection coverage for resolved backlog/feature settings in tests/ui/catalog.test.ts and tests/web/state.test.ts"
```

---

## Parallel Example: User Story 3

```bash
# Launch the focused US3 inspection regressions together:
Task: "Add CLI coverage for msq config show human and JSON output plus unknown-feature failures in tests/commands/commands.test.ts"
Task: "Add env interpolation and repo-config error coverage for web/TUI inspection consumers in tests/config/index.test.ts, tests/web/state.test.ts, and tests/web/server.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate repo-local overrides versus global fallback before touching deeper precedence

### Incremental Delivery

1. Land repo-config schema, parsing, interpolation, and shared resolver foundations first
2. Deliver US1 to prove repo-local defaults override global config safely
3. Deliver US2 to preserve backlog/feature precedence and shared runtime behavior
4. Deliver US3 to add safe env-backed config plus explicit inspection surfaces
5. Finish with docs and the required validation commands

### Parallel Team Strategy

1. One developer can own shared resolver/schema work while another prepares regression fixtures in Phase 1 and early Phase 2
2. After Phase 2, runtime-consumer integration (US1/US2) and inspection-surface work (US3) can proceed with limited overlap
3. Rejoin in Phase 6 for quickstart validation and documentation

---

## Notes

- [P] tasks touch different files and can be executed independently once their prerequisites are satisfied
- Story labels map every story-phase task back to the originating user story
- Each user story defines an independent verification path before later phases build on it
- All tasks follow the required checklist format with checkbox, task ID, optional `[P]`, required story label in story phases, and exact file paths
