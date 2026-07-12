# Tasks: Remove OVERRIDE PONTUAL

**Input**: Design documents from `/specs/007-remove-override-pontual/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Not explicitly requested - no test tasks included

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify current build state before removal

- [X] T001 Verify current build passes (npm run typecheck, npm run lint, npm test)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Remove WebSocket protocol overrides parameter that blocks both frontend and backend

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Remove `overrides?` field from WebSocketClientMessage type in src/web/types.ts
- [X] T003 Remove `overrides` parameter from startFeature() function signature in src/web/server.ts
- [X] T004 Remove overrideArgs construction and application logic in src/web/server.ts

**Checkpoint**: WebSocket protocol cleaned - frontend and CLI can now be updated independently

---

## Phase 3: User Story 2 - Executar feature sem opcao de override (Priority: P2)

**Goal**: Remove all UI elements related to override pontual from the feature detail screen

**Independent Test**: Open feature detail in web UI and verify no override section, fields, or buttons are visible

### Implementation for User Story 2

- [X] T005 [P] [US2] Remove OverrideSection component definition from src/web/static/components/FeaturePreview.js
- [X] T006 [P] [US2] Remove overrides state initialization from FeaturePreview.js
- [X] T007 [P] [US2] Remove handleOverrideChange handler from FeaturePreview.js
- [X] T008 [P] [US2] Remove cleanOverrides logic from FeaturePreview.js
- [X] T009 [US2] Remove OverrideSection rendering from FeaturePreview.js JSX
- [X] T010 [US2] Remove override send logic from src/web/static/app.js
- [X] T011 [P] [US2] Remove .override-fields CSS rules from src/web/static/styles.css
- [X] T012 [US2] Update footer text in FeaturePreview.js to remove "with optional overrides" mention

**Checkpoint**: UI no longer displays or sends override pontual data

---

## Phase 4: User Story 3 - Executar feature via CLI sem flags de override (Priority: P2)

**Goal**: Remove CLI flags and in-memory mutation logic for override pontual

**Independent Test**: Run `msq run --help` and verify --tool, --model, --effort flags are not listed

### Implementation for User Story 3

- [X] T013 [P] [US3] Remove --tool, --model, --effort option definitions from src/commands/run.ts
- [X] T014 [US3] Remove in-memory feature mutation logic from src/commands/run.ts

**Checkpoint**: CLI no longer accepts override flags; execution uses only persisted config

---

## Phase 5: User Story 1 - Editar e persistir configuracao de feature (Priority: P1)

**Goal**: Verify that Save Config is the only path for feature customization and works correctly

**Independent Test**: Edit feature parameters via web UI, save config, reload page, verify values persist; start feature and verify it uses persisted config

### Implementation for User Story 1

- [X] T015 [US1] Verify Save Config flow persists parameters correctly via web UI
- [X] T016 [US1] Verify feature execution uses persisted config from database

**Checkpoint**: Save Config confirmed as the sole customization mechanism

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Remove dead code, update documentation, run final validation

- [X] T017 Remove tokenEstimatesByTool property from state in src/web/state.ts
- [X] T018 Remove tokenEstimatesByTool from type definition in src/web/types.ts
- [X] T019 Remove collectTokenEstimatesByTool function from src/web/state.ts
- [X] T020 Update JSDoc comment in src/ui/catalog.ts to replace "override" with "per-feature config"
- [X] T021 [P] Update docs/features/F34-web-run-detail-and-control-polish.md to remove override references
- [X] T022 [P] Update docs/features/F36-web-feature-config-persistence.md to remove override coexistence notes
- [X] T023 [P] Update docs/ROADMAP.md to remove override pontual mention
- [X] T024 Run quickstart.md validation scenarios (CLI help, UI check, typecheck, lint, test, grep for override references)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US2 (UI removal) and US3 (CLI removal) can proceed in parallel
  - US1 (verification) depends on US2 and US3 completion
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 1 (P1)**: Depends on US2 and US3 completion (verification after removal)

### Within Each User Story

- US2: Remove component parts (T005-T008) in parallel, then remove rendering (T009), then cleanup app.js (T010), CSS (T011), footer (T012)
- US3: Remove flag definitions (T013), then remove mutation logic (T014)
- US1: Verification tasks only (T015-T016)

### Parallel Opportunities

- Phase 2: T002, T003, T004 can run in parallel (different files/locations)
- Phase 3 (US2): T005, T006, T007, T008, T011 can run in parallel (different code sections)
- Phase 4 (US3): T013 can run independently
- Phase 6: T021, T022, T023 can run in parallel (different doc files)

---

## Parallel Example: User Story 2

```bash
# Launch all component removals for User Story 2 together:
Task: "Remove OverrideSection component definition from FeaturePreview.js"
Task: "Remove overrides state initialization from FeaturePreview.js"
Task: "Remove handleOverrideChange handler from FeaturePreview.js"
Task: "Remove cleanOverrides logic from FeaturePreview.js"
Task: "Remove .override-fields CSS rules from styles.css"
```

---

## Implementation Strategy

### MVP First (User Story 2 + 3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 2 (UI removal)
4. Complete Phase 4: User Story 3 (CLI removal)
5. **STOP and VALIDATE**: Test that override is completely removed
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 2 (UI) → Test independently → Deploy/Demo
3. Add User Story 3 (CLI) → Test independently → Deploy/Demo
4. Add User Story 1 (verification) → Confirm Save Config works → Final validation
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 2 (UI removal)
   - Developer B: User Story 3 (CLI removal)
3. After US2 + US3 complete:
   - Developer A: User Story 1 (verification)
   - Developer B: Polish phase (docs, dead code)

---

## Notes

- [P] tasks = different files or code sections, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Zero new dependencies, zero schema migrations, zero new APIs
- Follow removal order from research.md: UI → WebSocket → CLI → State/Types → CSS → Docs
