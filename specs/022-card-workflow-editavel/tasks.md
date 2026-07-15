---
description: "Implementation tasks for editable Workflow card"
---

# Tasks: Card de workflow editável

**Input**: Design documents from `/specs/022-card-workflow-editavel/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/feature-config-websocket.md`, and `quickstart.md`

**Tests**: Required. The feature changes WebSocket, SQLite, and React behavior; add focused Vitest coverage before the matching implementation work, then run the constitution baseline.

**Organization**: Tasks are grouped by user story so each increment can be independently implemented and tested.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: User-story traceability label
- Every task names its target file or validation artifact.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the feature-specific test and validation entry points without adding dependencies or a new subsystem.

- [X] T001 Review the acceptance matrix and focused commands in specs/022-card-workflow-editavel/quickstart.md before changing src/web/ or src/db/.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the existing narrow WebSocket contract and save path while retaining the catalog as the only persistence owner.

**⚠️ CRITICAL**: Complete this phase before wiring either success or rejected-save UI behavior.

- [X] T002 Extend FeatureConfigPatch with workflow.approvals.channel and add typed FeatureConfigSaveIssue/FeatureConfigSaveResult server-message shapes in src/web/types.ts.
- [X] T003 Update the action:updateFeatureConfig handling to send a featureConfig:saveResult only to its initiating WebSocket client in src/web/server.ts.
- [X] T004 Preserve the existing successful reconcile/state:full broadcast and ui:info/ui:notice observability while distinguishing accepted and rejected config saves in src/web/server.ts.

**Checkpoint**: The wire contract can acknowledge an individual config save without exposing a Feature payload or adding an HTTP/SQLite client path.

---

## Phase 3: User Story 1 - Ajustar o workflow de uma feature (Priority: P1) 🎯 MVP

**Goal**: Edit each supported workflow preference in the feature detail and persist only changed values.

**Independent Test**: Change mode, task synchronization, approval destination, and legacy auto-advance individually; save, receive refreshed state, and re-render the detail with the saved values as its clean baseline.

### Tests for User Story 1

- [X] T005 [P] [US1] Add component tests for editable mode, syncTasksToBacklog, approvals.channel, and approvals.autoAdvance controls and their sparse patches in tests/web/featureConfigDetail.test.tsx.
- [X] T006 [P] [US1] Add WebSocket server coverage for an accepted workflow patch, its initiating-client featureConfig:saveResult, and subsequent state:full reconciliation in tests/web/server.test.ts.
- [X] T007 [P] [US1] Add catalog coverage proving each valid sparse workflow patch preserves workflow siblings, stages, step guidance, session policy, and unrelated feature fields in tests/db/backlogCatalog.test.ts.

### Implementation for User Story 1

- [X] T008 [US1] Add a four-field WorkflowDraft, baseline comparison, and sparse workflow-patch builder in src/web/client/components/FeatureConfigDetail.tsx.
- [X] T009 [US1] Replace the read-only editable workflow values with EditableSelectField and EditableToggleField controls, including a visibly legacy auto-advance label, in src/web/client/components/FeatureConfigDetail.tsx.
- [X] T010 [US1] Render a workflow-only save action only for a dirty, locally valid WorkflowDraft and dispatch its sparse patch through onSaveConfig in src/web/client/components/FeatureConfigDetail.tsx.
- [X] T011 [US1] Route accepted featureConfig:saveResult messages to the active feature-detail state and reset the WorkflowDraft baseline only after the matching refreshed feature state arrives in src/web/client/App.tsx.

**Checkpoint**: A valid one-field workflow edit persists atomically and reopens as the new saved value without altering stages or unrelated configuration.

---

## Phase 4: User Story 2 - Corrigir uma configuração de workflow inválida (Priority: P2)

**Goal**: Prevent invalid workflow saves and give field-specific, retryable guidance without overwriting the persisted feature.

**Independent Test**: Attempt a modified save with an unavailable approval channel or a merged workflow invariant violation; verify no catalog row changes, the card keeps the draft, shows the issue, and permits a corrected retry.

### Tests for User Story 2

- [X] T012 [P] [US2] Add component tests that keep an unavailable approval destination and rejected-save draft visible, show the returned field guidance, and allow a corrected retry in tests/web/featureConfigDetail.test.tsx.
- [X] T013 [P] [US2] Add WebSocket tests for rejected workflow saves: an initiating-client featureConfig:saveResult with issues, ui:notice observability, and no successful state reconciliation in tests/web/server.test.ts.
- [X] T014 [P] [US2] Add SQLite assertions that an invalid merged workflow patch throws and leaves data_json and updated_at unchanged in tests/db/backlogCatalog.test.ts.

### Implementation for User Story 2

- [X] T015 [US2] Convert catalog/schema failures into stable workflow issue paths and actionable messages while preserving atomic no-write behavior in src/web/server.ts.
- [X] T016 [US2] Store and route rejected featureConfig:saveResult payloads by feature ID without treating them as state:full updates in src/web/client/App.tsx.
- [X] T017 [US2] Display local unavailable-channel guidance and server-returned workflow issues without clearing the draft or enabling an empty/invalid save in src/web/client/components/FeatureConfigDetail.tsx.

**Checkpoint**: Rejected saves do not mutate SQLite, retain the editor values, identify what to fix, and can be retried after correction.

---

## Phase 5: User Story 3 - Preservar o fluxo já configurado (Priority: P2)

**Goal**: Allow workflow-mode changes without losing existing stages or non-editable workflow configuration.

**Independent Test**: Start with feature stages, step guidance, and session policy; switch only mode, save, and confirm every non-edited value remains unchanged after reload.

### Tests for User Story 3

- [X] T018 [P] [US3] Add a mode-only catalog patch regression covering preservation of stages, stepGuidance, sessionPolicy, approval values, and all non-workflow feature fields in tests/db/backlogCatalog.test.ts.
- [X] T019 [P] [US3] Add workflow-card tests that mark auto-advance as legacy and verify mode-only saves do not emit stages, stepGuidance, or sessionPolicy in tests/web/featureConfigDetail.test.tsx.

### Implementation for User Story 3

- [X] T020 [US3] Restrict the WorkflowDraft sparse-patch builder to mode, syncTasksToBacklog, approvals.channel, and approvals.autoAdvance so preserved workflow properties cannot be dispatched from src/web/client/components/FeatureConfigDetail.tsx.
- [X] T021 [US3] Retain the existing deep merge and full FeatureSchema validation boundary for mode-only workflow saves in src/db/backlogCatalog.ts.

**Checkpoint**: Switching execution mode preserves all existing stages and every configuration property outside the four editable values.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the complete observable behavior and repository validation gates.

- [X] T022 Run the focused component, WebSocket, and catalog suites specified in specs/022-card-workflow-editavel/quickstart.md.
- [X] T023 Run the required build, test, typecheck, and lint gates documented in .specify/memory/constitution.md.
- [X] T024 Execute the manual dashboard save/reopen and invalid-retry scenario from specs/022-card-workflow-editavel/quickstart.md and record any discrepancy in specs/022-card-workflow-editavel/quickstart.md.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on T001 and blocks the workflow card result flow.
- **US1 (Phase 3)**: Depends on T002–T004; it is the MVP.
- **US2 (Phase 4)**: Depends on the typed contract from Phase 2 and extends the same card/save path delivered by US1.
- **US3 (Phase 5)**: Depends on the sparse workflow path from US1; its preservation test coverage can begin after T002.
- **Polish (Phase 6)**: Depends on all implemented stories.

### User Story Dependencies

- **US1 (P1)**: No user-story dependency after foundational work.
- **US2 (P2)**: Uses US1's WorkflowDraft and save callback, but its invalid-save behavior remains independently testable against a configured feature.
- **US3 (P2)**: Uses US1's sparse mode save but is independently verifiable with a staged feature fixture.

### Parallel Opportunities

- T005–T007 target separate test boundaries and can proceed in parallel after the contract is settled.
- T012–T014 target separate test boundaries and can proceed in parallel.
- T018–T019 target separate test files and can proceed in parallel.
- US2's catalog/server tests and US3's preservation tests may proceed concurrently after T002–T004.

## Parallel Example: User Story 1

```text
Task: "Add workflow-card sparse-patch tests in tests/web/featureConfigDetail.test.tsx"
Task: "Add accepted-save WebSocket tests in tests/web/server.test.ts"
Task: "Add sparse workflow merge tests in tests/db/backlogCatalog.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001–T004 to make the typed save acknowledgement available.
2. Complete T005–T011 to deliver valid edits for all four workflow fields.
3. Run the focused tests from `quickstart.md` and demonstrate one valid save/reopen flow.

### Incremental Delivery

1. Add US1 for successful, sparse workflow edits and refreshed baselines.
2. Add US2 to make failures actionable and retryable without writes.
3. Add US3 regression protection for stages and all preserved properties.
4. Complete the full validation and manual dashboard scenario.

## Notes

- `[P]` tasks use separate files and have no dependency on unfinished work in their group.
- All workflow persistence remains in `src/db/backlogCatalog.ts`; browser code does not access SQLite or the filesystem.
- Tests must precede their matching behavior changes and prove both no-write rejection and same-interaction refreshed state.
