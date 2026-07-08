# Tasks: Theme System

**Input**: Design documents from `/specs/004-theme-system/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Add targeted config and TUI coverage because plan.md and quickstart.md define automated validation for theme resolution, fallback behavior, and representative rendering.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the shared theme contracts and baseline modules used by all stories

- [X] T001 Create theme contract types and exported role/status/tone definitions in `src/ui/theme/types.ts`
- [X] T002 Create the built-in `default`, `dark`, `light`, and `minimal` theme registry in `src/ui/theme/builtins.ts`
- [X] T003 [P] Create theme resolution and semantic-style helper scaffolding in `src/ui/theme/resolve.ts` and `src/ui/theme/styles.ts`

**Checkpoint**: Theme modules and contracts exist for the rest of the implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared config and provider plumbing that MUST be complete before user story work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Extend persistent config defaults and schema for optional `theme` preference in `src/config/index.ts`
- [X] T005 Create `ThemeProvider` and `useTheme()` context plumbing in `src/ui/theme/context.tsx`
- [X] T006 Refactor `src/ui/format.ts` to consume semantic theme helpers instead of hardcoded status color tables
- [X] T007 Integrate active-theme resolution and provider mounting at the `src/ui/App.tsx` root
- [X] T008 [P] Add shared themed-render test setup in `tests/ui/render.test.tsx` and `tests/ui/components.test.ts`

**Checkpoint**: Theme preference, resolution, and provider wiring are ready for story work

---

## Phase 3: User Story 1 - Select a Preferred Theme (Priority: P1) 🎯 MVP

**Goal**: Let users choose a built-in theme in persistent config and apply it safely at TUI startup

**Independent Test**: Set `theme` in config to a supported built-in value, restart the TUI, and confirm the selected style is applied; set an invalid name and confirm startup falls back to `default` with clear feedback.

### Tests for User Story 1

- [X] T009 [P] [US1] Add config tests for missing, valid, and unknown theme preferences in `tests/config/index.test.ts`
- [X] T010 [P] [US1] Add startup theme-selection and invalid-theme feedback tests in `tests/ui/app.test.ts`

### Implementation for User Story 1

- [X] T011 [US1] Implement `ThemePreferenceInput` parsing and theme persistence behavior in `src/config/index.ts`
- [X] T012 [US1] Implement default-theme fallback resolution and warning message generation in `src/ui/theme/resolve.ts`
- [X] T013 [US1] Apply resolved theme selection and fallback notice emission in `src/ui/App.tsx`
- [X] T014 [US1] Surface startup theme feedback through `src/ui/components/StatusBar.tsx` and `src/ui/components/NotificationsFeed.tsx`

**Checkpoint**: Users can select a built-in theme, and invalid values recover safely without breaking startup

---

## Phase 4: User Story 2 - Consistent Semantic Styling Across Components (Priority: P1)

**Goal**: Replace hardcoded colors with shared semantic roles so status, focus, accent, and muted states look consistent everywhere

**Independent Test**: Run the TUI under one non-default theme and verify that matching semantic states render consistently across the sidebar, run table, notifications, overlays, and detail panels.

### Tests for User Story 2

- [X] T015 [P] [US2] Add semantic status and notification mapping tests in `tests/ui/format.test.ts`
- [X] T016 [P] [US2] Add representative themed rendering assertions across screens in `tests/ui/render.test.tsx` and `tests/ui/components.test.ts`

### Implementation for User Story 2

- [X] T017 [P] [US2] Replace run-status and notification color maps with role-based helpers in `src/ui/format.ts` and `src/ui/theme/styles.ts`
- [X] T018 [P] [US2] Migrate shell selection and border styling in `src/ui/App.tsx`, `src/ui/components/StatusBar.tsx`, and `src/ui/components/CommandBar.tsx`
- [X] T019 [P] [US2] Migrate list and navigation styling in `src/ui/components/RunTable.tsx`, `src/ui/components/Sidebar.tsx`, and `src/ui/components/GatePanel.tsx`
- [X] T020 [P] [US2] Migrate overlay and notification styling in `src/ui/components/CommandPalette.tsx`, `src/ui/components/HelpOverlay.tsx`, and `src/ui/components/NotificationsFeed.tsx`
- [X] T021 [P] [US2] Migrate overview, detail, and cost styling in `src/ui/components/MainPanel.tsx` and `src/ui/components/CostDashboard.tsx`
- [X] T022 [US2] Remove residual hardcoded TUI color and border usage from `src/ui/App.tsx`, `src/ui/format.ts`, and `src/ui/components/`

**Checkpoint**: Semantic theme roles fully drive user-visible TUI styling across the existing component set

---

## Phase 5: User Story 3 - Remain Readable in Different Terminal Conditions (Priority: P2)

**Goal**: Ensure the built-in theme variants stay readable on dark, light, and constrained terminals, especially the reduced `minimal` theme

**Independent Test**: Launch the TUI with `default`, `dark`, `light`, and `minimal` and verify that headings, borders, statuses, notifications, and muted text remain distinguishable in each variant.

### Tests for User Story 3

- [X] T023 [P] [US3] Add built-in profile contract coverage for all four theme variants in `tests/ui/theme.test.ts`
- [X] T024 [P] [US3] Add readability regression coverage for dark, light, and minimal theme states in `tests/ui/render.test.tsx`

### Implementation for User Story 3

- [X] T025 [US3] Tune built-in role palettes and surface behavior for all four themes in `src/ui/theme/builtins.ts`
- [X] T026 [US3] Implement minimal-theme emphasis handling for focus, muted text, and borders in `src/ui/theme/styles.ts` and `src/ui/theme/context.tsx`
- [X] T027 [US3] Map per-theme run-status and notification tones for readability in `src/ui/theme/builtins.ts` and `src/ui/format.ts`
- [X] T028 [US3] Update manual validation guidance for theme switching and constrained-terminal fallback in `specs/004-theme-system/quickstart.md` and `docs/features/F10-theme-system.md`

**Checkpoint**: All four built-in themes remain understandable and preserve critical status distinctions

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish documentation, validation, and cleanup that cuts across multiple stories

- [X] T029 [P] Document persistent theme configuration and built-in theme names in `README.md` and `docs/features/F10-theme-system.md`
- [X] T030 Audit `src/ui/` and `tests/ui/` for remaining hardcoded styling tokens and remove any leftovers tied to the pre-theme palette
- [X] T031 Run the five manual scenarios in `specs/004-theme-system/quickstart.md` and update that file with any corrected operator steps
- [X] T032 Run targeted automated validation for `tests/config/index.test.ts`, `tests/ui/app.test.ts`, `tests/ui/format.test.ts`, `tests/ui/render.test.tsx`, `tests/ui/components.test.ts`, and `tests/ui/theme.test.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies and can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational and establishes the MVP theme-selection flow
- **User Story 2 (Phase 4)**: Depends on Foundational; can overlap with late US1 work once provider and resolution plumbing are stable
- **User Story 3 (Phase 5)**: Depends on Foundational and should follow the US2 semantic-role migration so readability is evaluated on the final shared styling model
- **Polish (Phase 6)**: Depends on the desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories after Foundational
- **User Story 2 (P1)**: No strict dependency on US1 after Foundational, but it benefits from the US1 startup flow being in place for validation
- **User Story 3 (P2)**: Depends on US2 semantic-role coverage to verify readability against the full themed interface

### Within Each User Story

- Tests must be written before the corresponding implementation tasks
- Theme contracts and provider wiring must exist before component migration
- Shared format/style helpers should be updated before migrating large groups of components
- Manual and automated validation close each story after implementation

### Parallel Opportunities

- Setup tasks `T002` and `T003` can proceed in parallel once `T001` defines the shared types
- Foundational tasks `T005` and `T008` can proceed in parallel after `T004`
- US1 tests `T009` and `T010` can run in parallel
- US2 migration tasks `T018` through `T021` can run in parallel after `T017`
- US3 tests `T023` and `T024` can run in parallel
- Polish tasks `T029` and `T030` can run in parallel after implementation stabilizes

---

## Parallel Example: User Story 1

```bash
# Launch the story tests together:
Task T009: "Add config tests for missing, valid, and unknown theme preferences in tests/config/index.test.ts"
Task T010: "Add startup theme-selection and invalid-theme feedback tests in tests/ui/app.test.ts"

# Then finish the startup flow:
Task T011: "Implement ThemePreferenceInput parsing in src/config/index.ts"
Task T012-T014: "Resolve theme, apply it in App.tsx, and surface feedback"
```

---

## Parallel Example: User Story 2

```bash
# Once semantic helpers are in place, migrate component groups in parallel:
Task T018: "Migrate shell selection and border styling"
Task T019: "Migrate list and navigation styling"
Task T020: "Migrate overlay and notification styling"
Task T021: "Migrate overview, detail, and cost styling"
```

---

## Parallel Example: User Story 3

```bash
# Validate readability while palette tuning is underway:
Task T023: "Add built-in profile contract coverage in tests/ui/theme.test.ts"
Task T024: "Add readability regression coverage in tests/ui/render.test.tsx"

# Then finalize built-in theme tuning:
Task T025-T027: "Tune profiles, minimal emphasis handling, and tone mappings"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate the config-selection and fallback flows from `specs/004-theme-system/quickstart.md`
5. Stop there if only the MVP is needed

### Incremental Delivery

1. Finish Setup + Foundational to establish theme primitives
2. Deliver User Story 1 so users can select a theme safely
3. Deliver User Story 2 to remove hardcoded styling and make themes coherent across the TUI
4. Deliver User Story 3 to tune readability for dark, light, and minimal terminals
5. Finish Polish for docs, audits, and final validation

### Parallel Team Strategy

1. One developer completes Setup + Foundational
2. After that:
   - Developer A owns US1 startup/config flow
   - Developer B owns US2 component migration
3. Once US2 is stable:
   - Developer A or C owns US3 palette/readability tuning
4. Finish with shared documentation and validation work

---

## Summary

- **Total Tasks**: 32
- **Setup**: 3 tasks (`T001`-`T003`)
- **Foundational**: 5 tasks (`T004`-`T008`)
- **User Story 1 (P1)**: 6 tasks (`T009`-`T014`)
- **User Story 2 (P1)**: 8 tasks (`T015`-`T022`)
- **User Story 3 (P2)**: 6 tasks (`T023`-`T028`)
- **Polish**: 4 tasks (`T029`-`T032`)
