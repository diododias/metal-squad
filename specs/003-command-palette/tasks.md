# Tasks: Command Palette & Keyboard Shortcuts

**Input**: Design documents from `/specs/003-command-palette/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are OPTIONAL - this feature specification does not request tests

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create fuzzy matching utility in src/ui/utils/fuzzyMatch.ts
- [X] T002 Create command types contract from specs/003-command-palette/contracts/types.ts to src/ui/types/commands.ts
- [X] T003 [P] Create keyboard shortcut types from contracts to src/ui/types/shortcuts.ts

**Checkpoint**: Basic type infrastructure ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core hooks and command infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create command registry structure in src/ui/commands/registry.ts
- [X] T005 Implement useKeyboardShortcuts hook in src/ui/hooks/useKeyboardShortcuts.ts
- [X] T006 Implement useCommandPalette hook in src/ui/hooks/useCommandPalette.ts
- [X] T007 Integrate keyboard shortcut hook into App.tsx (refactor existing useInput logic)
- [X] T008 Define initial command set in src/ui/commands/definitions.ts (run, pause, resume, abort, stats, config, help)

**Checkpoint**: Foundation ready - command infrastructure and hooks complete, user story implementation can now begin

---

## Phase 3: User Story 1 - Quick Command Access via Palette (Priority: P1) 🎯 MVP

**Goal**: Enable users to discover and execute commands via fuzzy search palette (Ctrl+P or :)

**Independent Test**: Open command palette (Ctrl+P or :), type to filter commands, execute any action through fuzzy search

### Implementation for User Story 1

- [X] T009 [US1] Create CommandPalette component in src/ui/components/CommandPalette.tsx
- [X] T010 [US1] Implement command filtering logic using fuzzyMatch utility in CommandPalette component
- [X] T011 [US1] Add keyboard event handlers for palette (Ctrl+P, :, Esc, Enter, arrows/j/k navigation)
- [X] T012 [US1] Integrate CommandPalette into App.tsx with state management
- [X] T013 [US1] Implement command availability filtering (hide unavailable commands)
- [X] T014 [US1] Add command category grouping display in palette UI
- [X] T015 [US1] Test command palette opening, filtering, and command execution per quickstart.md scenarios 1-2

**Checkpoint**: Command palette is fully functional - users can discover and execute any command via Ctrl+P or :

---

## Phase 4: User Story 2 - Context-Aware Keyboard Shortcuts (Priority: P2)

**Goal**: Enable quick keyboard shortcuts for common actions specific to current panel context

**Independent Test**: Navigate to gates panel, press a/s/r to approve/skip/retry gates; navigate to run detail, press p/x to pause/abort

### Implementation for User Story 2

- [X] T016 [P] [US2] Define gates panel shortcuts in src/ui/commands/gatesShortcuts.ts (a, s, r)
- [X] T017 [P] [US2] Define run detail shortcuts in src/ui/commands/runShortcuts.ts (p, x)
- [X] T018 [US2] Implement focus context tracking in App.tsx (gates, runs, run-detail panels)
- [X] T019 [US2] Update useKeyboardShortcuts hook to filter active shortcuts by current context
- [ ] T020 [US2] Wire gate approval/skip/retry actions to shortcuts in GatePanel component
- [X] T021 [US2] Wire pause/abort actions to shortcuts in run detail panel
- [X] T022 [US2] Test context-aware shortcuts per quickstart.md scenario 3

**Checkpoint**: Context-specific shortcuts work only in their designated panels

---

## Phase 5: User Story 3 - Global Navigation Shortcuts (Priority: P2)

**Goal**: Enable consistent keyboard shortcuts that work across all screens

**Independent Test**: Use shortcuts from any screen (q, Tab, j/k, Enter, Esc, Ctrl+L, ?, 1-5) and verify consistent behavior

### Implementation for User Story 3

- [X] T023 [P] [US3] Define global navigation shortcuts in src/ui/commands/globalShortcuts.ts (q, Tab, j/k, Enter, Esc)
- [X] T024 [P] [US3] Define global view shortcuts (Ctrl+L for log toggle, ? for help, 1-5 for tabs)
- [X] T025 [US3] Implement quit shortcut (q) with cleanup logic in App.tsx
- [X] T026 [US3] Implement Tab focus cycling logic across panels in App.tsx
- [ ] T027 [US3] Implement j/k list navigation in RunTable and GatePanel components
- [X] T028 [US3] Implement Enter drill-down and Esc back navigation in App.tsx
- [X] T029 [US3] Implement Ctrl+L log toggle functionality
- [ ] T030 [US3] Implement number key tab switching (1-5) if tabs exist
- [X] T031 [US3] Test global navigation shortcuts per quickstart.md scenario 4

**Checkpoint**: All global shortcuts work consistently from any screen

---

## Phase 6: User Story 4 - Shortcut Discovery via Help Overlay (Priority: P3)

**Goal**: Provide quick reference help overlay showing all available shortcuts

**Independent Test**: Press ? from any screen, verify all shortcuts displayed with context-aware shortcuts highlighted

### Implementation for User Story 4

- [X] T032 [US4] Create HelpOverlay component in src/ui/components/HelpOverlay.tsx
- [X] T033 [US4] Implement help overlay state management (isOpen, current context)
- [X] T034 [US4] Generate help content from keyboard shortcut registry (global vs context-specific)
- [X] T035 [US4] Add context highlighting logic (highlight shortcuts relevant to current focus)
- [X] T036 [US4] Integrate HelpOverlay into App.tsx with ? key binding
- [X] T037 [US4] Implement help overlay close on ? or Esc
- [ ] T038 [US4] Test help overlay per quickstart.md scenario 5

**Checkpoint**: Help overlay provides complete shortcut reference with context awareness

---

## Phase 7: User Story 5 - Status Bar Shortcut Hints (Priority: P3)

**Goal**: Display contextual shortcut hints in status bar based on current focus

**Independent Test**: Navigate to different screens and verify status bar updates with relevant shortcut hints

### Implementation for User Story 5

- [X] T039 [US5] Update StatusBar component to accept dynamic shortcut hints prop
- [X] T040 [US5] Implement hint generation from active shortcuts for current context
- [X] T041 [US5] Wire status bar hints to focus context in App.tsx
- [X] T042 [US5] Format hints compactly for status bar display (e.g., "a:approve s:skip r:retry ?:help")
- [X] T043 [US5] Test status bar hints update per quickstart.md scenario 6

**Checkpoint**: Status bar provides just-in-time shortcut reminders based on context

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T044 [P] Test edge cases per quickstart.md (invalid commands, modal conflicts, shortcuts when palette open)
- [X] T045 [P] Ensure command palette and help overlay prevent shortcut propagation when open
- [ ] T046 Verify all shortcuts work without conflicts across contexts
- [ ] T047 Performance check: palette opens/closes instantly (<50ms), fuzzy search feels real-time (<100ms)
- [ ] T048 Run full quickstart.md validation scenarios 1-6
- [X] T049 Verify no regressions in existing TUI functionality
- [X] T050 Code cleanup: remove old inline keyboard handling from App.tsx after hook refactor

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 (Command Palette) is the foundation for discovery
  - US2 (Context Shortcuts) and US3 (Global Shortcuts) can proceed in parallel after US1
  - US4 (Help Overlay) depends on shortcut registry from US2/US3
  - US5 (Status Bar Hints) depends on shortcut registry from US2/US3
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent of US1 but both enhance discoverability
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Independent of US1/US2
- **User Story 4 (P3)**: Should start after US2/US3 complete (needs full shortcut registry)
- **User Story 5 (P3)**: Should start after US2/US3 complete (needs shortcut definitions)

### Within Each User Story

- US1: Component → Filtering → Integration → Testing
- US2: Define shortcuts (parallel) → Context tracking → Wire actions → Testing
- US3: Define shortcuts (parallel) → Implement each shortcut → Testing
- US4: Component → Content generation → Integration → Testing
- US5: StatusBar updates → Hint generation → Testing

### Parallel Opportunities

- All Setup tasks (T001-T003) can run in parallel
- Foundational tasks T004-T006 can run in parallel (different files)
- US2 shortcut definitions (T016, T017) can run in parallel
- US3 shortcut definitions (T023, T024) can run in parallel
- US3 implementation tasks (T025-T030) can run in parallel if staffed (different components)
- After Foundational phase completes:
  - US1, US2, US3 can all start in parallel (different concerns)
  - US4 and US5 must wait for US2/US3 registry

---

## Parallel Example: User Story 2

```bash
# Launch shortcut definitions together:
Task T016: "Define gates panel shortcuts in src/ui/commands/gatesShortcuts.ts"
Task T017: "Define run detail shortcuts in src/ui/commands/runShortcuts.ts"

# Then sequentially:
Task T018: "Implement focus context tracking" (depends on definitions)
Task T019: "Update useKeyboardShortcuts hook" (depends on context)
Task T020-T021: "Wire actions" (can be parallel, different components)
Task T022: "Test" (final validation)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types, utilities)
2. Complete Phase 2: Foundational (hooks, command infrastructure) - CRITICAL
3. Complete Phase 3: User Story 1 (command palette)
4. **STOP and VALIDATE**: Test command palette independently per quickstart.md scenarios 1-2
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 (Command Palette) → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 (Context Shortcuts) → Test independently → Deploy/Demo
4. Add User Story 3 (Global Shortcuts) → Test independently → Deploy/Demo
5. Add User Story 4 (Help Overlay) → Test independently → Deploy/Demo
6. Add User Story 5 (Status Bar Hints) → Test independently → Deploy/Demo
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Command Palette)
   - Developer B: User Story 2 (Context Shortcuts)
   - Developer C: User Story 3 (Global Shortcuts)
3. After US2/US3 complete:
   - Developer A or B: User Story 4 (Help Overlay)
   - Developer C: User Story 5 (Status Bar Hints)
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Tests are NOT included (not requested in spec)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Fuzzy search is lightweight inline implementation (no external library per research.md)
- Command palette and help overlay use Ink Box layering pattern per research.md
- Keyboard architecture uses hook-based registry per research.md
- All validation scenarios are defined in quickstart.md

---

## Summary

- **Total Tasks**: 50
- **User Story 1 (P1)**: 7 tasks (T009-T015) — Command Palette
- **User Story 2 (P2)**: 7 tasks (T016-T022) — Context Shortcuts
- **User Story 3 (P2)**: 9 tasks (T023-T031) — Global Shortcuts
- **User Story 4 (P3)**: 7 tasks (T032-T038) — Help Overlay
- **User Story 5 (P3)**: 5 tasks (T039-T043) — Status Bar Hints
- **Setup**: 3 tasks (T001-T003)
- **Foundational**: 5 tasks (T004-T008)
- **Polish**: 7 tasks (T044-T050)

**MVP Scope**: User Story 1 (Command Palette) — 7 tasks after foundational
**Parallel Opportunities**: ~15 tasks marked [P] can run simultaneously
**Independent Test Criteria**: Each user story has clear validation scenarios in quickstart.md
