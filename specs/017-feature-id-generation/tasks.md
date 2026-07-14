# Tasks: F52 - Registro de Features com ID Gerado Automaticamente

**Input**: Design documents from `/specs/017-feature-id-generation/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/feature-id-registration-contract.md`, and `quickstart.md`

**Tests**: Included because the specification defines mandatory scenarios and the project constitution requires automated coverage for changed behavior.

**Organization**: Tasks are grouped by priority-ordered user story. The shared registration domain and catalog transaction boundary are established before story work.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the feature-specific implementation and test entry points in the existing single-project structure.

- [X] T001 [P] Create the feature-ID domain test entry point in `tests/backlog/feature-id.test.ts`.
- [X] T002 [P] Prepare isolated YAML and SQLite fixtures for feature-ID registration scenarios in `tests/backlog/load-extended.test.ts` and `tests/db/backlogCatalog.test.ts`.
- [X] T003 [P] Create the shared feature-ID module entry point in `src/core/backlog/featureId.ts` without changing `EpicSchema.id` in `src/core/backlog/schema.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Provide the normalized input boundary, reusable allocation contract, and atomic catalog primitives required by every user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add an authoring-time feature schema with optional `id` and keep the normalized `FeatureSchema`/`Feature` contract requiring `id: string` in `src/core/backlog/schema.ts`.
- [X] T005 Implement canonical alphabet/regex validation, unbiased random generation, collision retry, opaque manual-ID classification, and `FeatureRegistrationResult` types in `src/core/backlog/featureId.ts`.
- [X] T006 [P] Add transaction and staged-file rollback primitives needed for atomic YAML/catalog publication in `src/db/index.ts`.
- [X] T007 Extend catalog feature row handling with global occupied-ID lookup, repository ownership checks, and transaction-safe publication hooks in `src/db/backlogCatalog.ts`.

**Checkpoint**: The normalized registration boundary and global catalog uniqueness primitives are ready for independent story implementation.

---

## Phase 3: User Story 1 - Cadastro em batch sem ID (Priority: P1) 🎯 MVP

**Goal**: Load ID-less backlog features, assign unique canonical `F-<8>` IDs, materialize them in YAML, and publish the identical IDs to the SQLite catalog atomically.

**Independent Test**: Load a backlog containing at least two ID-less features with an isolated database, verify valid distinct IDs in YAML and catalog, load it again, and verify zero ID changes.

### Tests for User Story 1

- [X] T008 [P] [US1] Cover canonical alphabet/length, 200 distinct generated IDs, deterministic collision retry, and occupied-ID exhaustion in `tests/backlog/feature-id.test.ts`.
- [X] T009 [P] [US1] Cover omitted-ID normalization, YAML materialization, repeated-load stability, feature reordering/title/spec-file edits, and read-only `--dry-run` behavior in `tests/backlog/load-extended.test.ts`.
- [X] T010 [P] [US1] Cover catalog/YAML identity agreement, atomic rollback, archived-ID non-reuse, concurrent writers, and unchanged run/gate/pipeline history in `tests/db/backlogCatalog.test.ts`.

### Implementation for User Story 1

- [X] T011 [US1] Refactor `loadBacklog` into parse/default/validate, registration, staged YAML materialization, and normalized publication steps in `src/core/backlog/load.ts`.
- [X] T012 [US1] Wire `msq backlog load` to allocate missing IDs, honor `--dry-run`, stage the source file, and print catalog diffs only after commit in `src/commands/backlog.ts`.
- [X] T013 [US1] Publish normalized metadata, epics, features, and tasks in one guarded SQLite transaction while archiving removed rows and preserving history in `src/db/backlogCatalog.ts`.
- [X] T014 [US1] Preserve original feature order and unrelated YAML values while writing assigned IDs and restoring the original file when publication fails in `src/core/backlog/load.ts`.

**Checkpoint**: User Story 1 is independently functional: new features receive stable IDs before catalog/runtime consumption and repeated loads are no-ops for identity.

---

## Phase 4: User Story 2 - Compatibilidade com IDs existentes (Priority: P2)

**Goal**: Preserve legacy/manual IDs byte-for-byte, reject malformed or duplicate explicit IDs with actionable errors, and keep dependency/history consumers opaque to ID format.

**Independent Test**: Load a mixed backlog containing `feat-N`, valid manual, canonical, and ID-less features; verify preservation, generated assignment, dependency resolution, and no partial persistence for invalid input.

### Tests for User Story 2

- [X] T015 [P] [US2] Cover legacy/manual preservation, whitespace/control rejection, malformed reserved `F-` rejection, duplicate IDs, and `EpicSchema.id` non-regression in `tests/backlog/schema.test.ts`.
- [X] T016 [P] [US2] Cover opaque canonical/legacy/manual dependency ordering and exact feature-ID resolution for graph, run, and notification paths in `tests/orchestrator/graph.test.ts` and `tests/commands/backlog.test.ts`.

### Implementation for User Story 2

- [X] T017 [US2] Enforce explicit-ID validation and duplicate detection before allocation or persistence, retaining valid values without case/prefix normalization in `src/core/backlog/featureId.ts` and `src/core/backlog/load.ts`.
- [X] T018 [US2] Reject cross-repository explicit-ID ownership conflicts instead of moving rows through upsert, and report the conflicting ID, owner, and rollback status in `src/db/backlogCatalog.ts`.
- [X] T019 [US2] Propagate feature location/title, invalid value/rule, duplicate, ownership, and no-commit error details through the batch command in `src/commands/backlog.ts`.
- [X] T020 [US2] Keep dependency ordering and runtime feature identity as opaque string equality for canonical, legacy, and manual IDs in `src/core/orchestrator/graph.ts`.

**Checkpoint**: User Stories 1 and 2 both work independently; existing IDs and historical references remain unchanged while invalid input cannot create partial state.

---

## Phase 5: User Story 3 - Fonte única para cadastro online futuro (Priority: P3)

**Goal**: Expose one reusable registration result for future online callers and make the web board display persisted catalog identity with a display-only legacy fallback.

**Independent Test**: Call the shared registration boundary with an online-style feature input, then build board state with a matching catalog entry and verify the exact persisted ID is displayed; verify the hash fallback is used only when no persisted entry exists.

### Tests for User Story 3

- [X] T021 [P] [US3] Cover the reusable batch/online registration input/output contract, `assigned`/`idKind` semantics, and exclusion of Epic IDs in `tests/backlog/feature-id.test.ts` and `tests/commands/backlog.test.ts`.
- [X] T022 [P] [US3] Cover persisted-ID board state, canonical/legacy display, and missing-catalog legacy fallback behavior in `tests/web/client.test.ts` and `tests/web/kanban-card.test.tsx`.

### Implementation for User Story 3

- [X] T023 [US3] Expose the reusable registration boundary with normalized feature, assigned flag, previous-ID/audit information, source, and ownership error results in `src/core/backlog/featureId.ts`.
- [X] T024 [US3] Include the persisted catalog feature ID in the web state contract without generating an authoritative identity in the UI in `src/web/state.ts`.
- [X] T025 [US3] Pass catalog identity through board columns/items to cards while retaining the run feature ID as an opaque value in `src/web/client/pages/BoardPage.tsx`.
- [X] T026 [US3] Render `persistedId ?? legacyFallback` in the board card and ensure the fallback is never used for server lookup or catalog persistence in `src/web/client/components/data/KanbanCard.tsx`.

**Checkpoint**: All three stories are independently functional; future online registration can reuse the same domain contract and the official web board shows persisted identity.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Synchronize feature documentation and prove the measurable outcomes and repository validation gates.

- [X] T027 [P] Update the source-of-truth feature record with implementation decisions, atomicity guarantees, and compatibility boundaries in `docs/features/F52-feature-id-generation.md`.
- [X] T028 [P] Keep the quickstart scenarios aligned with the 200-feature batch, collision retry, rollback, board fallback, and concurrent publication checks in `specs/017-feature-id-generation/quickstart.md`.
- [X] T029 [P] Add a regression assertion that `EpicSchema.id` and `backlog_epics.epic_id` remain unchanged by feature registration in `tests/backlog/schema.test.ts` and `tests/db/backlogCatalog.test.ts`.
- [X] T030 Run the focused feature-ID suites from `specs/017-feature-id-generation/quickstart.md` and record any required command or fixture corrections in `specs/017-feature-id-generation/quickstart.md`.
- [X] T031 Run `npm run build`, `npm test`, `npm run typecheck`, and `npm run lint` and resolve or document failures in `package.json` and the affected source/test paths before implementation handoff.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; establishes feature-specific paths and fixtures.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational and is the recommended MVP increment.
- **User Story 2 (Phase 4)**: Depends on Foundational; it can be tested independently but reuses the registration and catalog boundaries from Phase 2.
- **User Story 3 (Phase 5)**: Depends on Foundational; its web work can proceed independently of the batch command after the shared contract exists.
- **Polish (Phase 6)**: Depends on the stories selected for delivery and the relevant focused tests.

### User Story Dependencies

- **US1 (P1)**: No dependency on another user story after Foundational; MVP.
- **US2 (P2)**: No behavioral dependency on US1, but uses the same normalized schema and catalog transaction primitives.
- **US3 (P3)**: No dependency on the complete online UI; it depends only on the shared registration result and persisted catalog identity.

### Parallel Opportunities

- T001-T003 can proceed independently during Setup.
- T006 and T007 can proceed in parallel after the shared domain boundary is agreed.
- T008-T010 are independent test tracks once the test fixtures exist.
- T015-T016 and T021-T022 can proceed in parallel because they target separate test concerns/files.
- T024-T026 can be split by web state, board composition, and card presentation after the persisted-ID shape is fixed.
- The repository workflow remains sequential for implementation and validation; `[P]` marks file-level independence for planning and review, not a requirement to create worktrees.

### Parallel Example: User Story 1

```text
Task T008: domain allocator tests in tests/backlog/feature-id.test.ts
Task T009: loader and dry-run tests in tests/backlog/load-extended.test.ts
Task T010: catalog transaction tests in tests/db/backlogCatalog.test.ts
```

### Parallel Example: User Story 2

```text
Task T015: schema and explicit-ID validation tests in tests/backlog/schema.test.ts
Task T016: graph/run/notification regression tests in tests/orchestrator/graph.test.ts and tests/commands/backlog.test.ts
```

### Parallel Example: User Story 3

```text
Task T021: shared registration contract tests in tests/backlog/feature-id.test.ts
Task T022: board display and fallback tests in tests/web/client.test.ts and tests/web/kanban-card.test.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 for ID generation, YAML materialization, catalog publication, dry-run, and rollback.
3. Run the independent US1 test criteria and the focused validation commands.
4. Stop for review/demo before adding compatibility and board work.

### Incremental Delivery

1. Deliver US1 as the batch-registration MVP.
2. Add US2 without changing existing explicit IDs or opaque consumers.
3. Add US3's reusable contract and persisted-ID web display without implementing the F57 online creation UI.
4. Finish Phase 6 and run the constitution validation gates.

## Notes

- Every task is a markdown checkbox with a sequential ID; `[P]` appears only on file-independent tasks; story tasks carry exactly one `[USn]` label.
- Tests are included because `spec.md` marks testing mandatory and the constitution requires automated coverage for changed behavior.
- `EpicSchema.id` is explicitly out of scope and must not be migrated or regenerated.
- No `msq run`, executor QA flow, worktree, commit, or later Spec Kit stage is part of this task-generation stage.
