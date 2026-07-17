# Tasks: Board cards display feature stages

**Input**: Design documents from `/specs/029-boardpage-stages/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`, and `contracts/board-card-workflow-stages.md`

**Tests**: Required by the project constitution and the feature plan. Add focused happy-dom coverage before changing `BoardPage`, then run the repository gates.

**Organization**: Tasks are grouped by user story so the board behavior can be implemented and verified as an independent increment.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing card contract and focused web-test location before changing the Board producer.

- [X] T001 Verify the SET-08 `stages?: string[]` consumer contract is available in `src/web/client/components/data/KanbanCard.tsx` before starting SET-09 work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the prerequisite card rendering capability without duplicating SET-08 work in this feature.

**⚠️ CRITICAL**: Do not implement this feature until the prerequisite is present; `BoardPage` must only produce feature-owned stage data.

- [X] T002 Record and resolve the SET-08 prerequisite against `specs/029-boardpage-stages/contracts/board-card-workflow-stages.md` and `src/web/client/components/data/KanbanCard.tsx`; if it is not landed, stop SET-09 implementation until that feature supplies the optional stages contract and compact rendering.

**Checkpoint**: `KanbanCardRun` accepts optional stages, renders a supplied sequence, and preserves both `undefined` and `[]` semantics.

---

## Phase 3: User Story 1 - Compare feature workflows on the board (Priority: P1) 🎯 MVP

**Goal**: Supply every TODO and run card with stages from its own feature-catalog entry, so heterogeneous workflows remain distinguishable in the same board view.

**Independent Test**: Render `BoardPage` with two catalogued features that have different stage arrays, a configured TODO card, and a run whose feature is absent from the catalog; assert each configured card renders only its own sequence and the unknown run still renders without one.

### Tests for User Story 1

- [X] T003 [US1] Add a focused happy-dom Board fixture covering two same-column runs with distinct feature workflows in `tests/web/client.test.ts`.
- [X] T004 [US1] Extend the Board fixture in `tests/web/client.test.ts` to assert a configured TODO receives its own stage array, an unknown-catalog run remains usable without stages, and an explicit empty stage array stays empty.

### Implementation for User Story 1

- [X] T005 [US1] Replace the TODO card composition in `src/web/client/pages/BoardPage.tsx` with `KanbanCard` input that passes `f.workflow.stages` while preserving feature identity, tool, effort, and activation behavior.
- [X] T006 [US1] Pass `state.featureCatalog[r.featureId]?.workflow.stages` as the optional `stages` value in the persisted-run `KanbanCard` input in `src/web/client/pages/BoardPage.tsx`.

**Checkpoint**: TODO and run cards retain their own configured workflow sequence; missing catalog entries omit stages without preventing Board rendering.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Validate the focused contract, repository gates, and feature documentation after the UI change.

- [X] T007 Run the focused Board and card contract suite for `tests/web/client.test.ts` and `tests/web/kanban-card.test.tsx` using the scenario in `specs/029-boardpage-stages/quickstart.md`.
- [X] T008 Run build, full test, typecheck, and lint gates for the changed `src/web/client/pages/BoardPage.tsx` and `tests/web/client.test.ts` files.
- [X] T009 Reconcile implementation and validation evidence with `specs/029-boardpage-stages/spec.md`, `specs/029-boardpage-stages/plan.md`, and `specs/029-boardpage-stages/contracts/board-card-workflow-stages.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: starts immediately.
- **Foundational (Phase 2)**: depends on T001 and blocks SET-09 until SET-08 is available.
- **User Story 1 (Phase 3)**: depends on T002; write T003–T004 before T005–T006.
- **Polish (Phase 4)**: depends on T003–T006.

### User Story Dependencies

- **User Story 1 (P1)**: starts after the SET-08 prerequisite is confirmed. It has no dependency on another SET-09 story.

### Within User Story 1

1. Add the independent Board scenarios in T003–T004 and confirm they fail before the producer changes.
2. Implement TODO composition in T005, then run-card composition in T006; both alter `BoardPage.tsx` and must be sequenced.
3. Run T007 and T008, then reconcile the versioned feature evidence in T009.

## Parallel Opportunities

- T003 and T004 can be designed in parallel only if split into separate test files; with the existing consolidated `tests/web/client.test.ts`, execute them sequentially to avoid a file conflict.
- The focused suite in T007 can run independently of documentation reconciliation in T009 after T005–T006 complete.
- No implementation tasks are marked `[P]`: both composition paths share `src/web/client/pages/BoardPage.tsx`.

## Parallel Example: User Story 1

```text
# After T005 and T006 complete, run validation concurrently with evidence review:
Task: "Run the focused Board/card tests in tests/web/client.test.ts and tests/web/kanban-card.test.tsx"
Task: "Compare implementation evidence with specs/029-boardpage-stages/contracts/board-card-workflow-stages.md"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Confirm the SET-08 card contract (T001–T002).
2. Add the focused Board scenarios (T003–T004).
3. Pass each feature's own stages at the TODO and run boundaries (T005–T006).
4. Validate the independent Board behavior (T007), then complete repository gates (T008).

### Incremental Delivery

This feature has one P1 story. Deliver it as a single UI-only increment after SET-08, with no schema, API, catalog, or legacy-TUI changes.

## Format Validation

All nine implementation tasks use the required checklist format: checkbox, sequential `T###` ID, optional `[P]` only for parallel work, `[US1]` on story tasks, and explicit file paths.
