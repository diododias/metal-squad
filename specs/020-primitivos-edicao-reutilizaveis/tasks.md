# Tasks: Primitivos de edicao reutilizaveis

**Input**: Design documents from `/specs/020-primitivos-edicao-reutilizaveis/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/editable-controls.md, quickstart.md

**Tests**: Required. The constitution requires automated coverage for changed behavior, and the feature contract explicitly requires markup and interaction coverage for all three controlled primitives.

**Organization**: Tasks are grouped by user story so that each scenario can be implemented and verified independently after the shared foundation is ready.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files and no incomplete dependency)
- **[Story]**: Maps the task to the relevant user story
- Every task lists its exact target file path

## Phase 1: Setup (Shared Test Infrastructure)

**Purpose**: Add the focused browser-like test capability required to dispatch native control events without changing the repository-wide Vitest environment.

- [X] T001 Add the `happy-dom` development dependency for the scoped component interaction tests in package.json and package-lock.json

---

## Phase 2: Foundational (Shared Field Contract)

**Purpose**: Establish the presentation-only shell shared by all primitives before any story-specific control implementation.

**⚠️ CRITICAL**: No user-story implementation begins until this phase is complete.

- [X] T002 Create the internal `EditableFieldShell` layout, stable label/control association, optional missing-value hint, readable modified marker, and dashboard-token styling in src/web/client/components/core/EditableFieldShell.tsx

**Checkpoint**: The shared shell owns no draft state, persistence, patch types, network access, or callbacks; user-story controls can now be implemented.

---

## Phase 3: User Story 1 - Reutilizar controles de edição consistentes (Priority: P1) 🎯 MVP

**Goal**: Provide controlled text, select, and boolean controls that expose user-proposed values to their consuming card while consistently rendering associated labels.

**Independent Test**: Mount each primitive in an isolated controlled test harness, dispatch a native change, and verify the parent receives the proposed text, option, or boolean value while each visible label is associated with its native field.

### Tests for User Story 1

- [X] T003 [US1] Write failing scoped-DOM tests for label association and text, select, and toggle callback delivery in tests/web/editable-controls.test.tsx

### Implementation for User Story 1

- [X] T004 [P] [US1] Implement the controlled string input and typed parent callback using `EditableFieldShell` in src/web/client/components/core/EditableTextField.tsx
- [X] T005 [P] [US1] Implement the controlled option select, option type, and typed parent callback using `EditableFieldShell` in src/web/client/components/core/EditableSelectField.tsx
- [X] T006 [P] [US1] Implement the controlled boolean checkbox/switch and typed parent callback using `EditableFieldShell` in src/web/client/components/core/EditableToggleField.tsx
- [X] T007 [US1] Make the User Story 1 interaction and label tests pass without moving draft state or save behavior into the primitives in tests/web/editable-controls.test.tsx

**Checkpoint**: A consuming card can use all three controls to receive typed edits without rebuilding shared label or field markup.

---

## Phase 4: User Story 2 - Reconhecer o estado de uma edição (Priority: P1)

**Goal**: Derive and visibly communicate pending changes from parent-supplied current and initial values, including automatic clearing after restoration or after the parent refreshes its saved reference.

**Independent Test**: Render every primitive with equal values, change it, then restore its initial value and refresh `initialValue`; the modified marker appears only while the typed values differ.

### Tests for User Story 2

- [X] T008 [US2] Add failing dirty-state transition coverage for equal, changed, restored, and parent-refreshed initial values across all primitives in tests/web/editable-controls.test.tsx

### Implementation for User Story 2

- [X] T009 [P] [US2] Derive string dirty state from `value !== initialValue` on every render and pass it to `EditableFieldShell` in src/web/client/components/core/EditableTextField.tsx
- [X] T010 [P] [US2] Derive select dirty state from `value !== initialValue` on every render and pass it to `EditableFieldShell` in src/web/client/components/core/EditableSelectField.tsx
- [X] T011 [P] [US2] Derive boolean dirty state from `value !== initialValue` on every render and pass it to `EditableFieldShell` in src/web/client/components/core/EditableToggleField.tsx
- [X] T012 [US2] Make the dirty-state tests pass while retaining no mutable `isDirty` state in the controls or shell in tests/web/editable-controls.test.tsx

**Checkpoint**: Pending changes are visible, readable, and always reflect the parent-owned values without duplicated dirty bookkeeping.

---

## Phase 5: User Story 3 - Lidar com campos indisponíveis ou sem valor (Priority: P2)

**Goal**: Keep disabled and absent-value fields understandable and stable, including an unavailable currently selected option, while preserving an externally supplied dirty indication.

**Independent Test**: Render text, select, and toggle controls with undefined/empty/no-option states and with `disabled`; labels and explanatory states remain visible, native interaction cannot change parent state, and a dirty marker remains visible for disabled changed values.

### Tests for User Story 3

- [X] T013 [US3] Add failing tests for undefined and empty values, disabled native behavior, preserved dirty markers, no select options, and unavailable selected options in tests/web/editable-controls.test.tsx

### Implementation for User Story 3

- [X] T014 [P] [US3] Render stable missing-value guidance and native disabled behavior for undefined text values without conflating them with empty strings in src/web/client/components/core/EditableTextField.tsx
- [X] T015 [P] [US3] Render missing/no-option guidance, disabled native behavior, and a disabled unavailable current option when received select values are absent from options in src/web/client/components/core/EditableSelectField.tsx
- [X] T016 [P] [US3] Render a non-ambiguous not-configured state for undefined booleans and preserve disabled native behavior without coercing undefined to false in src/web/client/components/core/EditableToggleField.tsx
- [X] T017 [US3] Make absent-value and disabled-state tests pass while keeping labels, received values, hints, and dirty markers legible in tests/web/editable-controls.test.tsx

**Checkpoint**: Every primitive remains stable and explanatory when editing is unavailable or input values are incomplete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the reusable component boundary and the repository gates without expanding the feature into configuration-card adoption or persistence work.

- [X] T018 [P] Run the focused component contract suite documented in specs/020-primitivos-edicao-reutilizaveis/quickstart.md against tests/web/editable-controls.test.tsx
- [X] T019 Run build, full test, typecheck, and lint gates documented in specs/020-primitivos-edicao-reutilizaveis/quickstart.md after the web-client TypeScript changes
- [X] T020 Perform the optional local web smoke check from specs/020-primitivos-edicao-reutilizaveis/quickstart.md and verify no interaction writes a patch, SQLite value, file, or network request

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately; T001 enables native interaction coverage.
- **Foundational (Phase 2)**: Depends on T001 and blocks every user story because all primitives render through `EditableFieldShell`.
- **US1 (Phase 3)**: Depends on T002; delivers the MVP controls.
- **US2 (Phase 4)**: Depends on US1 because it adds and verifies dirty derivation on each primitive.
- **US3 (Phase 5)**: Depends on US1; it can start after US1 independently of US2, but must preserve the dirty behavior if US2 is already complete.
- **Polish (Phase 6)**: Depends on the desired user-story phases being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Requires only the shared shell; it is the MVP.
- **User Story 2 (P1)**: Extends the three controls from US1 with derived pending-change presentation.
- **User Story 3 (P2)**: Extends the three controls from US1 with disabled and missing-value handling; it does not require persistence or a configuration-card consumer.

### Within Each User Story

- Write the story's focused tests before its implementation tasks and confirm they fail for the missing behavior.
- Keep `EditableFieldShell` presentation-only; controls only propose values through their callbacks.
- Do not add imports from backlog, database, server, WebSocket, or patch modules.

## Parallel Opportunities

- **US1**: T004, T005, and T006 can run in parallel after T002 and T003 because they create separate primitive modules.
- **US2**: T009, T010, and T011 can run in parallel after T008 because dirty comparison is local to each primitive.
- **US3**: T014, T015, and T016 can run in parallel after T013 because each task owns one primitive module.
- **Polish**: T018 may run in parallel with any final manual review, while T019 must use the completed implementation; T020 follows a successful build.

## Parallel Example: User Story 1

```text
Task: "Implement the controlled string input in src/web/client/components/core/EditableTextField.tsx"
Task: "Implement the controlled option select in src/web/client/components/core/EditableSelectField.tsx"
Task: "Implement the controlled boolean control in src/web/client/components/core/EditableToggleField.tsx"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 and T002.
2. Write T003, then implement T004 through T006.
3. Complete T007 and run T018.
4. Demonstrate the three controlled primitives before adding dirty, missing-value, or card-adoption work.

### Incremental Delivery

1. Shared shell plus US1 gives consuming cards consistent controlled controls.
2. US2 adds deterministic pending-change visibility from parent values.
3. US3 makes the same controls resilient to disabled, absent, and stale-option states.
4. Phase 6 verifies the complete UI-only boundary; SET-02 through SET-06 can adopt the primitives separately.

## Notes

- [P] tasks use distinct files and have no dependency on unfinished sibling tasks.
- Tests stay scoped to `tests/web/editable-controls.test.tsx`; the default repository test environment remains unchanged.
- This feature intentionally does not modify `FeatureConfigDetail.tsx`, emit `FeatureConfigPatch`, access persistence, or reconstruct any Settings card.
