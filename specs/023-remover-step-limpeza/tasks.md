---
description: "Implementation tasks for Remover step com limpeza"
---

# Tasks: Remover step com limpeza

**Input**: Design documents from `/specs/023-remover-step-limpeza/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/workflow-step-removal.md`, and `quickstart.md`

**Tests**: Required by the feature plan and project constitution. Write focused regression tests before the corresponding implementation, then run the full build, test, typecheck, and lint gates.

**Organization**: This feature has one independently testable P1 user story. Its UI edit, WebSocket patch, atomic catalog update, and durable pipeline workflow revision form one vertical slice.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its listed prerequisites because it changes a distinct file.
- **[Story]**: User story served by the task.
- Every task includes its exact implementation or test path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the focused regression suite and keep the feature artifact traceable before product code changes.

- [X] T001 Add removal-flow fixture data covering guided, isolated, plain, and sole stages in `tests/web/featureConfigDetail.test.tsx`
- [X] T002 [P] Add pipeline revision-A/revision-B fixture helpers for resume coverage in `tests/runner/execute.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the narrow patch and durable workflow-revision persistence required by the P1 vertical slice.

**⚠️ CRITICAL**: Complete these contract and persistence prerequisites before wiring the browser removal control.

- [X] T003 Extend the narrow workflow config patch with `sessionPolicy.alwaysIsolatedStages` in `src/web/types.ts`
- [X] T004 Add `workflow_snapshot_json` to new and migrated pipeline schemas in `src/db/index.ts`
- [X] T005 Extend pipeline row, snapshot encoding/decoding, insert, and read helpers for feature-id workflow snapshots in `src/db/repo.ts`

**Checkpoint**: The web patch can represent isolation cleanup and a pipeline can durably carry its structural workflow revision.

---

## Phase 3: User Story 1 - Remove a configured step safely (Priority: P1) 🎯 MVP

**Goal**: An editor removes any non-final workflow step with one composed save that cleans its guidance and isolation references, while active/resumed pipelines retain their original structural workflow revision.

**Independent Test**: Configure multiple stages with guidance and an isolated stage, remove one through its close control, and save. Verify the refreshed catalog has no reference to it, remaining settings are unchanged, the final-stage close control is disabled without a request, and a paused pipeline started before the edit resumes its original stages while a new pipeline uses the saved revision.

### Tests for User Story 1

- [X] T006 [P] [US1] Add component regressions for one composed removal patch, retained unrelated settings, deterministic next selection, save acknowledgement handling, and disabled final-stage control in `tests/web/featureConfigDetail.test.tsx`
- [X] T007 [P] [US1] Add WebSocket save-result coverage for forwarding `workflow.sessionPolicy.alwaysIsolatedStages` and reporting validation failures in `tests/web/server.test.ts`
- [X] T008 [P] [US1] Add catalog transaction regressions for valid guided/isolated removal and rollback of dangling stage references in `tests/db/backlogCatalog.test.ts`
- [X] T009 [P] [US1] Add repository migration and JSON round-trip coverage for `workflow_snapshot_json` in `tests/db/repo-extended.test.ts`
- [X] T010 [P] [US1] Add runner/resume regressions proving active pipelines use revision A, resumed pipelines rehydrate revision A, and new pipelines use revision B in `tests/runner/execute.test.ts`

### Implementation for User Story 1

- [X] T011 [US1] Preserve the typed partial isolation list while converting the client config patch to the catalog patch in `src/web/server.ts`
- [X] T012 [US1] Render an accessible close control per workflow stage, disable the final-stage control with explanatory feedback, and submit one filtered stages/guidance/isolation patch in `src/web/client/components/FeatureConfigDetail.tsx`
- [X] T013 [US1] Update draft selection and guidance only after a successful refreshed config-save result in `src/web/client/components/FeatureConfigDetail.tsx`
- [X] T014 [US1] Capture the resolved feature-id structural workflow map when creating a new pipeline in `src/core/runner/execute.ts`
- [X] T015 [US1] Rehydrate each resumed feature's structural workflow from the persisted pipeline snapshot while retaining the live `approvals.autoAdvance` override in `src/commands/resume.ts`

**Checkpoint**: The complete remove-and-save path is independently functional; no saved workflow retains references to a removed stage, and execution revisions stay immutable for active pipelines.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Validate the documented acceptance path and all required repository gates.

- [X] T016 Update delivered behavior and focused validation evidence in `specs/023-remover-step-limpeza/spec.md`
- [X] T017 Run the focused removal and snapshot suite from `specs/023-remover-step-limpeza/quickstart.md`
- [X] T018 Run build, full tests, typecheck, and lint from `package.json`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Starts after the relevant setup fixture; T003 enables the WebSocket contract, and T004 → T005 enables snapshot use.
- **User Story 1 (Phase 3)**: T006–T010 define expected behavior first. T011 depends on T003; T012–T013 depend on T003 and T011; T014 depends on T004–T005; T015 depends on T005 and T014.
- **Polish (Phase 4)**: Starts after T006–T015 pass their focused tests.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on the foundational patch and snapshot contracts. It has no dependency on another user story.

### Within User Story 1

1. Write T006–T010 and confirm the relevant cases fail before implementation.
2. Complete the contract/persistence changes T011–T015 in dependency order.
3. Re-run the focused suite and verify the independent test criteria before cross-cutting gates.

### Parallel Opportunities

- T001 and T002 can be prepared in parallel because they affect distinct test files.
- After the prerequisite contracts are agreed, T006–T010 are parallel test work in distinct files.
- T011 and T014 can proceed in parallel after T003 and T004–T005 respectively; T012–T013 then follow T011, and T015 follows T014.

## Parallel Example: User Story 1

```text
Task: "Add component removal regressions in tests/web/featureConfigDetail.test.tsx"
Task: "Add WebSocket patch regressions in tests/web/server.test.ts"
Task: "Add catalog atomicity regressions in tests/db/backlogCatalog.test.ts"
Task: "Add pipeline snapshot regressions in tests/db/repo-extended.test.ts"
Task: "Add runner/resume revision regressions in tests/runner/execute.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete setup and foundational patch/snapshot contracts.
2. Deliver the P1 composed UI removal and atomic catalog save.
3. Deliver persisted revision capture and resume rehydration.
4. Stop and verify the independent P1 test flow plus the focused suite.

### Incremental Delivery

1. The narrow WebSocket patch enables an atomic, valid catalog edit.
2. The close control exposes that edit safely in the web dashboard.
3. Pipeline snapshots make the edit safe for an active or resumed execution.
4. Full repository gates confirm the vertical slice does not regress other behavior.

## Notes

- The dashboard is the only UI target; do not add or change Ink TUI behavior.
- Do not split stage, guidance, and isolation cleanup into multiple saves; the catalog must validate and persist one composed patch atomically.
- Structural workflow fields come from the pipeline snapshot on resume; `approvals.autoAdvance` remains intentionally live.
