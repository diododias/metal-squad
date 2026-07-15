---
description: "Implementation tasks for the editable execution card"
---

# Tasks: Card de execução editável

**Input**: Design documents from `/specs/021-card-execucao-editavel/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`, and `contracts/websocket-feature-config.md`

**Tests**: Required. The specification defines acceptance scenarios and the constitution requires automated coverage for changed behavior. Write focused tests first and keep the existing server and catalog regression coverage green.

**Organization**: Tasks are grouped by user story so every increment can be independently implemented and tested.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish focused component-test coverage around the execution card without changing its existing server, WebSocket, or SQLite contract.

- [X] T001 Create a `FeatureConfigDetail` render fixture and DOM interaction helpers in tests/web/featureConfigDetail.test.tsx

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Confirm the existing reusable controls, `FeatureConfigPatch`, `action:updateFeatureConfig`, and catalog merge path remain the shared foundation for all stories.

**⚠️ CRITICAL**: No new endpoint, persistence schema, migration, or generic control is required. The existing contracts in src/web/types.ts, src/web/server.ts, src/db/backlogCatalog.ts, and src/web/client/components/core/ are the prerequisite boundary.

**Checkpoint**: Foundation ready — user-story work can proceed using the existing partial-update path.

---

## Phase 3: User Story 1 - Ajustar a execução de uma feature (Priority: P1) 🎯 MVP

**Goal**: Let a person edit and save each execution field with a sparse patch, then adopt the refreshed feature as the saved baseline without a reload.

**Independent Test**: Render a feature detail, change and save each of `tool`, `model`, `effort`, `maxTokens`, and `autoStart` individually, then rerender with the returned feature and confirm the saved value is displayed with no pending indication.

### Tests for User Story 1

- [X] T002 [P] [US1] Add component tests for individual execution-field edits, sparse save patches, and refreshed saved baselines in tests/web/featureConfigDetail.test.tsx
- [X] T003 [P] [US1] Extend WebSocket integration coverage for tool and model patches plus state reconciliation in tests/web/server.test.ts
- [X] T004 [P] [US1] Add catalog regression coverage that a one-field execution patch preserves the other persisted execution fields in tests/db/backlogCatalog.test.ts

### Implementation for User Story 1

- [X] T005 [US1] Add a saved execution baseline and controlled draft state for tool, model, effort, maxTokens, and autoStart in src/web/client/components/FeatureConfigDetail.tsx
- [X] T006 [US1] Replace the read-only Execução values with EditableSelectField, EditableTextField, and EditableToggleField controls in src/web/client/components/FeatureConfigDetail.tsx
- [X] T007 [US1] Build and dispatch only normalized changed execution fields through onSaveConfig, skip an empty patch, and synchronize the draft when the selected feature or refreshed persisted values change in src/web/client/components/FeatureConfigDetail.tsx

**Checkpoint**: The five execution values can be saved one at a time, unchanged values are preserved, and a successful `state:full` update becomes the new card baseline.

---

## Phase 4: User Story 2 - Revisar alterações antes de salvar (Priority: P1)

**Goal**: Make pending execution changes clear before saving and remove their indication as soon as the draft is restored to its saved value.

**Independent Test**: Change one execution control, verify only that control is marked `modified`, restore it to the saved value, and verify no save action is emitted.

### Tests for User Story 2

- [X] T008 [US2] Add component tests for per-field dirty indicators, reverting to the baseline, and no-op saves in tests/web/featureConfigDetail.test.tsx

### Implementation for User Story 2

- [X] T009 [US2] Pass each execution draft and saved baseline through the reusable editable controls and expose a save affordance only for a non-empty valid execution patch in src/web/client/components/FeatureConfigDetail.tsx

**Checkpoint**: A person can audit exactly what will change, reverse any change locally, and cannot cause a write with a clean card.

---

## Phase 5: User Story 3 - Corrigir dados de execução inválidos (Priority: P2)

**Goal**: Block invalid token budgets and unavailable tools before dispatching a patch while retaining the draft for correction or retry.

**Independent Test**: Attempt saves with an empty, non-numeric, non-integer, or non-positive `maxTokens`, then with an unavailable saved tool; each attempt shows actionable guidance and emits no action until corrected.

### Tests for User Story 3

- [X] T010 [P] [US3] Add component tests for invalid maxTokens guidance, unavailable saved tools, retained drafts, and blocked dispatch in tests/web/featureConfigDetail.test.tsx
- [X] T011 [P] [US3] Extend atomic invalid-patch coverage for unsupported tools and non-positive token limits in tests/db/backlogCatalog.test.ts

### Implementation for User Story 3

- [X] T012 [US3] Validate maxTokens as a supplied positive integer, block unavailable tool values, and render actionable inline correction guidance while preserving the draft in src/web/client/components/FeatureConfigDetail.tsx

**Checkpoint**: Invalid execution settings never leave the browser, and the existing catalog remains the authoritative final validation boundary for direct WebSocket clients.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the documented end-to-end behavior and all required repository gates.

- [X] T013 [P] Run the focused component, WebSocket, and catalog suites documented in specs/021-card-execucao-editavel/quickstart.md
- [X] T014 Run build, full tests, typecheck, and relevant lint gates from package.json after the execution-card changes
- [ ] T015 Perform the six manual web scenarios and record any implementation-specific verification notes in specs/021-card-execucao-editavel/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Begins immediately.
- **Foundational (Phase 2)**: Uses the already-delivered SET-01 controls and update contract; it blocks user-story implementation only until their interface is confirmed.
- **US1 (Phase 3)**: Depends on Setup and the existing foundation; delivers the MVP edit-and-save path.
- **US2 (Phase 4)**: Depends on the US1 draft/baseline implementation because it makes its dirty behavior explicit.
- **US3 (Phase 5)**: Depends on the US1 save path and may proceed after the same foundation; it adds validation before dispatch.
- **Polish (Phase 6)**: Depends on all intended stories being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on another story; this is the MVP.
- **US2 (P1)**: Builds on US1's draft/baseline state in the same component.
- **US3 (P2)**: Builds on US1's draft and save behavior; its catalog tests are independent from the component work.

### Within Each User Story

- Write focused tests before the production change and confirm they fail for the missing behavior.
- Keep `FeatureConfigDetail` responsible for draft, dirty state, client validation, and sparse patch construction.
- Keep `src/web/server.ts` responsible for WebSocket dispatch and reconciliation, and `src/db/backlogCatalog.ts` responsible for authoritative merge and persistence validation.

## Parallel Opportunities

- T002, T003, and T004 modify separate test files and can run in parallel before T005.
- T010 and T011 modify separate test files and can run in parallel before T012.
- T013 can run independently of documentation-only review work once implementation is complete.

## Parallel Example: User Story 1

```text
Task: "Add component tests for execution edits in tests/web/featureConfigDetail.test.tsx"
Task: "Extend WebSocket patch coverage in tests/web/server.test.ts"
Task: "Add sparse-patch preservation coverage in tests/db/backlogCatalog.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 and confirm the existing foundation described in Phase 2.
2. Complete T002–T007 to deliver the editable five-field execution card.
3. Run the US1 independent test and the focused test suite.
4. Demo the successful save and refreshed baseline before proceeding.

### Incremental Delivery

1. US1 supplies editable execution values and sparse persistence.
2. US2 adds the explicit pending-change and no-op-save guarantees.
3. US3 adds pre-dispatch validation and recovery guidance.
4. Phase 6 verifies the complete web behavior and repository gates.

## Notes

- All 15 tasks use the required checklist format: checkbox, sequential ID, optional `[P]`, required user-story label within story phases, and an exact file path.
- No task creates a new WebSocket action, endpoint, SQLite schema, migration, or TUI behavior.
