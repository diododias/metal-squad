---
description: "Implementation tasks for workflow-step reordering"
---

# Tasks: Reorder Workflow Steps

**Input**: Design documents from `/specs/024-reorder-steps/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/workflow-step-reordering.md`, and `quickstart.md`

**Tests**: Required. The specification and constitution require focused component, WebSocket/server, SQLite catalog, and runner snapshot coverage, followed by build, test, typecheck, and lint gates.

**Organization**: Tasks are grouped by user story so each increment remains independently testable. The existing narrow WebSocket, catalog merge, and pipeline-snapshot paths are intentionally reused; no reorder-specific endpoint, table, schema, or runner algorithm is introduced.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it modifies a different file and has no incomplete-task dependency.
- **[Story]**: User story served by the task (`US1` or `US2`).
- Every task identifies the exact file or command-bearing project file it concerns.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the feature uses the existing validation harness and the documented acceptance procedure before changing behavior.

- [X] T001 Verify the focused Vitest and baseline validation commands in `specs/024-reorder-steps/quickstart.md` against scripts in `package.json` before implementation.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Lock down the existing shared configuration boundary that both stories depend on; no new endpoint, database table, or runner mechanism is needed.

- [X] T002 Add a WebSocket regression for the stages-only `action:updateFeatureConfig` patch and its `featureConfig:saveResult` acknowledgement in `tests/web/server.test.ts`.

**Checkpoint**: The established `FeatureConfigPatch` → server → catalog path is covered and ready for the editor behavior.

---

## Phase 3: User Story 1 - Reorder a workflow (Priority: P1) MVP

**Goal**: Let an editor preview an accessible reordered workflow, save exactly one complete `workflow.stages` permutation, and ensure only future runs use the saved revision.

**Independent Test**: Move a middle stage in a three-stage workflow, verify the visible preview and exact stages-only save payload, refresh with success, then prove a pre-save pipeline retains its snapshot while a post-save pipeline uses the new order.

### Tests for User Story 1

- [X] T003 [US1] Add failing component tests for adjacent moves, disabled boundary controls, immediate draft preview, and no save action for an unchanged draft in `tests/web/featureConfigDetail.test.tsx`.
- [X] T004 [P] [US1] Add runner regression coverage for pre-save/resumed pipeline order versus post-save pipeline order in `tests/runner/execute.test.ts`.

### Implementation for User Story 1

- [X] T005 [US1] Add saved-order synchronization, a local `draftStages` permutation, and adjacent move handlers without mutating the persisted workflow in `src/web/client/components/FeatureConfigDetail.tsx`.
- [X] T006 [US1] Render accessible move-up and move-down controls plus the proposed ordered stage preview, disabling boundary and pending-save controls in `src/web/client/components/FeatureConfigDetail.tsx`.
- [X] T007 [US1] Add the dirty-only save-step-order action that sends exactly `{ workflow: { stages: draftStages } }`, adopts a refreshed accepted order as baseline, and retains the draft with `workflowIssues` after failure in `src/web/client/components/FeatureConfigDetail.tsx`.
- [X] T008 [US1] Complete the save-result component tests for accepted refreshes and rejected saves retaining the proposed order and actionable feedback in `tests/web/featureConfigDetail.test.tsx`.

**Checkpoint**: An editor can reorder and save a workflow in the web dashboard; later pipelines use the saved order while an active/resumed pipeline retains its captured order.

---

## Phase 4: User Story 2 - Preserve step configuration while reordering (Priority: P2)

**Goal**: Guarantee that a sequence-only reorder keeps every step's guidance and execution-isolation configuration attached to its stage name.

**Independent Test**: Persist a reordered three-stage workflow with guidance and `alwaysIsolatedStages`, reload it from SQLite, and confirm the stage array changed while those records are byte-for-byte equivalent and every stage occurs once.

### Tests for User Story 2

- [X] T009 [US2] Add catalog regression coverage that persists a complete reordered stages array while preserving `workflow.stepGuidance` and `workflow.sessionPolicy.alwaysIsolatedStages` in `tests/db/backlogCatalog.test.ts`.
- [X] T010 [US2] Add catalog failure coverage proving an invalid non-permutation reorder leaves `backlog_features.data_json` unchanged in `tests/db/backlogCatalog.test.ts`.

### Implementation for User Story 2

- [X] T011 [US2] Verify the reorder save path emits only `workflow.stages` and does not include or remap `stepGuidance` or `sessionPolicy` in `src/web/client/components/FeatureConfigDetail.tsx`.

**Checkpoint**: A saved reorder changes only sequence; guidance and isolation remain keyed to their original stage names, and invalid saves leave the catalog revision intact.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature against the documented contract and project gates.

- [X] T012 [P] Execute the focused component, server, catalog, and runner test command documented in `specs/024-reorder-steps/quickstart.md`.
- [X] T013 Run the documented build, full test, typecheck, and lint gates from `package.json` after all focused tests pass.
- [X] T014 Perform the manual reordered-workflow acceptance scenario, including boundary controls, persistence feedback, and active-versus-new pipeline behavior, in `specs/024-reorder-steps/quickstart.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately.
- **Foundational (Phase 2)**: Depends on T001 and blocks editor implementation because it locks the accepted narrow transport contract.
- **User Story 1 (Phase 3)**: Starts after T002. T003 and T004 define the expected component and pipeline behavior before T005-T007; T008 verifies the final editor state transitions.
- **User Story 2 (Phase 4)**: Starts after T002 and can be implemented after T007 so it verifies the actual stages-only payload. It does not require a new server, schema, or catalog implementation.
- **Polish (Phase 5)**: Runs after both stories are complete.

### User Story Dependencies

- **US1 (P1)**: Depends only on the shared configuration transport coverage in T002.
- **US2 (P2)**: Depends on the same transport and the stages-only UI behavior from T007; its SQLite assertions are otherwise isolated from US1's component and runner tests.

### Parallel Opportunities

- T004 can run in parallel with T003 because it changes `tests/runner/execute.test.ts`, not the component test file.
- T012 can run independently from final manual acceptance work after feature tasks complete.

---

## Parallel Example: User Story 1

```text
Task: "Add component reorder tests in tests/web/featureConfigDetail.test.tsx"
Task: "Add pipeline-snapshot reorder tests in tests/runner/execute.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001-T002 to establish the existing narrow save contract.
2. Write T003-T004, then implement T005-T007 in the feature editor.
3. Complete T008 and validate the editor plus future-versus-active pipeline boundary.
4. Demo the reorder preview and save flow before taking on the preservation regression suite.

### Incremental Delivery

1. Deliver US1: accessible draft reordering, stages-only save, acknowledged refresh, and immutable active pipeline revisions.
2. Deliver US2: prove configuration preservation and atomic rejection at the catalog boundary.
3. Run T012-T014 to validate focused behavior, repository gates, and the dashboard journey.

## Notes

- Reuse `action:updateFeatureConfig`, `FeatureConfigPatch`, `updateCatalogFeature()`, and pipeline workflow snapshots; do not introduce a reorder-specific API, table, or runner code path.
- A reorder is a nonempty permutation of the existing names. It must never add, remove, duplicate, or positionally remap a stage's guidance or isolation configuration.
