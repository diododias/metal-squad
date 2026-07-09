# Tasks: Detail Screen UX Improvements

**Input**: Design documents from `/specs/005-detail-screen-ux/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in spec — test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- UI components: `src/ui/components/`
- Theme system: `src/ui/theme/`
- Format utilities: `src/ui/format.ts`
- Detail sections: `src/ui/detailSections.ts`
- App orchestration: `src/ui/App.tsx`
- Keyboard shortcuts: `src/ui/commands/`

---

## Phase 2: Setup (Shared Infrastructure)

**Purpose**: No setup tasks required — all files already exist in the codebase.

---

## Phase 3: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

This feature has no true foundational prerequisites — all user stories can proceed independently after Phase 2 (which is empty). However, US4 (Dark Theme) affects the visual foundation used by all other stories, so it should be completed first.

---

## Phase 4: User Story 4 - Readable Dark Theme Text (Priority: P1) 🎯 MVP

**Goal**: All text is clearly readable on dark terminal backgrounds with white body text and colored accents on borders/headers.

**Independent Test**: Set terminal to dark background, open app, verify all text is white/light and borders/headers use accent colors (cyan, blue, green, etc.).

### Implementation for User Story 4

- [X] T001 [P] [US4] Update theme builtins dark profile to use white (#ffffff) for primary text role in `src/ui/theme/builtins.ts`
- [X] T002 [P] [US4] Update theme builtins dark profile to use light gray (#9a9a9a) for muted text role in `src/ui/theme/builtins.ts`
- [X] T003 [P] [US4] Update theme builtins dark profile to use visible accent colors (not dark) for border and header roles in `src/ui/theme/builtins.ts`
- [X] T004 [US4] Verify DetailMetric component uses theme roles correctly for text and borders in `src/ui/components/MainPanel.tsx`
- [X] T005 [US4] Verify DetailSection component uses theme roles correctly for borders and titles in `src/ui/components/MainPanel.tsx`

**Checkpoint**: All text is readable on dark backgrounds — the app is now usable.

---

## Phase 5: User Story 1 - Compact Detail Layout (Priority: P1)

**Goal**: Detail screen adapts responsively to terminal width — stacked on <80col, compact on 80-120col, full on >120col.

**Independent Test**: Resize terminal to 80 columns or less, open a run detail, verify all metric cards arrange without overflow.

### Implementation for User Story 1

- [X] T006 [US1] Update DetailMetric component to accept flexDirection prop and render vertically in stacked mode in `src/ui/components/MainPanel.tsx`
- [X] T007 [US1] Update metric cards container to use flexDirection based on layoutMode in `src/ui/components/MainPanel.tsx`
- [X] T008 [US1] Add ellipsis truncation to all metric card values using truncateText in `src/ui/components/MainPanel.tsx`
- [X] T009 [US1] Update metricWidth calculation to handle stacked mode (full width per card) in `src/ui/components/MainPanel.tsx`

**Checkpoint**: Detail screen fits within 80-column terminals without horizontal overflow.

---

## Phase 6: User Story 2 - Tab Navigation for Detail Sections (Priority: P1)

**Goal**: Switch between detail sections (Summary, Spec, Live Output, etc.) using tabs instead of J/K scrolling.

**Independent Test**: Open run detail, press Tab/Shift+Tab or number keys to switch sections, verify each section displays with full available height.

### Implementation for User Story 2

- [X] T010 [US2] Add activeTab state to UiState in `src/ui/App.tsx`
- [X] T011 [US2] Implement switchToTab callback to update activeTab and detailSectionIndex in `src/ui/App.tsx`
- [X] T012 [US2] Add Tab keybinding to cycle to next section in run-detail context in `src/ui/commands/runShortcuts.ts`
- [X] T013 [US2] Add Shift+Tab keybinding to cycle to previous section in run-detail context in `src/ui/commands/runShortcuts.ts`
- [X] T014 [US2] Add number key (1-7) keybindings for direct section access in run-detail context in `src/ui/commands/runShortcuts.ts`
- [X] T015 [US2] Update MainPanel to accept activeTab prop and display tab bar with section labels in `src/ui/components/MainPanel.tsx`
- [X] T016 [US2] Implement inline TabBar component (defined within MainPanel.tsx, not a separate file) showing DETAIL_SECTION_ORDER with active highlight in `src/ui/components/MainPanel.tsx`
- [X] T017 [US2] Add "✓ Done" summary indicator (success color) to WorkflowStepper when ALL stages complete, displayed after the last stage marker in `src/ui/components/WorkflowStepper.tsx`
- [X] T018 [US2] Update detailSectionIndex to use activeTab instead of scroll-based paging in `src/ui/App.tsx`

**Checkpoint**: Users can navigate between detail sections in 1 keypress (direct access) vs current 3-5 keypresses.

---

## Phase 7: User Story 3 - Simplified Run Summary (Priority: P2)

**Goal**: Run summary displays key metrics in a single compact line with visual separators.

**Independent Test**: Open run detail, verify summary shows as one line with pipe or dot separators between metrics.

### Implementation for User Story 3

- [X] T019 [US3] Refactor summary section rendering to combine all metrics into one Text line with pipe separators in `src/ui/components/MainPanel.tsx`
- [X] T020 [US3] Remove redundant workflow section from renderDetailSection (already in header stepper) in `src/ui/components/MainPanel.tsx`

**Checkpoint**: Run summary consumes 1 line instead of 5 lines, saving 80% vertical space.

---

## Phase 8: User Story 5 - Consistent Tool/Agent Naming (Priority: P2)

**Goal**: Tool name (codex, claude, opencode) is consistent across kanban card, detail header, and live output.

**Independent Test**: Start a run with a specific tool, verify the same tool name appears in kanban card, detail header, and live output.

### Implementation for User Story 5

- [X] T021 [US5] Ensure KanbanCard displays the adapter name from `RunSummary.tool` (not model) — fix if incorrect — in `src/ui/components/KanbanCard.tsx`
- [X] T022 [US5] Ensure DetailMetric "Tool" card uses `selectedRun.tool` (not `selectedFeature.model`) — fix if incorrect — in `src/ui/components/MainPanel.tsx`
- [X] T023 [US5] Ensure `toolModelEffort` function uses `RunSummary.tool` consistently — fix if incorrect — in `src/ui/components/KanbanCard.tsx`

**Checkpoint**: Tool name is consistent across all views (0 instances of codex/claude mismatch).

---

## Phase 9: User Story 6 - Clean Heartbeat Display (Priority: P3)

**Goal**: Heartbeats show only what the agent is currently doing, hiding diagnostic details.

**Independent Test**: While a run is executing, observe live output heartbeats, verify they show only the agent's current activity summary.

### Implementation for User Story 6

- [X] T024 [US6] Update formatHeartbeatLine to hide diagnostic metrics (stdout/stderr byte counts, idle time) in `src/ui/format.ts`
- [X] T025 [US6] Ensure error heartbeats still show diagnostic details when agent errors occur in `src/ui/format.ts`

**Checkpoint**: Heartbeat lines show only agent activity (diagnostic details hidden for normal operation).

---

## Phase 10: User Story 7 - Indented Tool Cards (Priority: P3)

**Goal**: Tool cards in kanban board are slightly indented with reduced spacing between them.

**Independent Test**: View kanban board, verify tool info lines are indented under the feature name with minimal vertical gap.

### Implementation for User Story 7

- [X] T026 [US7] Increase marginLeft on toolModelEffort Text line in KanbanCard (pendingFeature branch) in `src/ui/components/KanbanCard.tsx`
- [X] T027 [US7] Increase marginLeft on toolModelEffort Text line in KanbanCard (run branch) in `src/ui/components/KanbanCard.tsx`
- [X] T028 [US7] Set marginBottom on KanbanCard Box container to 0 (from 1) for zero inter-card spacing in `src/ui/components/KanbanCard.tsx`

**Checkpoint**: Tool cards are visually indented with minimal vertical gap.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T029 Edge case: handle extremely narrow terminals (< 40 columns) — force stacked layout, truncate with ellipsis, hide decorative elements — in `src/ui/format.ts`
- [X] T030 Edge case: handle empty sections in tab navigation — show "No [section] available" empty state — in `src/ui/components/MainPanel.tsx`
- [X] T031 Edge case: handle null/empty tool name — display fallback "unknown" in all views — in `src/ui/components/KanbanCard.tsx`
- [X] T032 Run quickstart.md validation (if exists)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 2)**: No dependencies - can start immediately (empty)
- **Phase 4 (US4 - Dark Theme)**: No dependencies - should complete first as it affects all visual output
- **Phase 5 (US1 - Layout)**: No dependencies on other stories
- **Phase 6 (US2 - Tabs)**: No dependencies on other stories
- **Phase 7 (US3 - Summary)**: No dependencies on other stories
- **Phase 8 (US5 - Naming)**: No dependencies on other stories
- **Phase 9 (US6 - Heartbeat)**: No dependencies on other stories
- **Phase 10 (US7 - Indent)**: No dependencies on other stories
- **Polish (Phase 11)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 4 (P1)**: Can start immediately - RECOMMENDED FIRST (visual foundation)
- **User Story 1 (P1)**: Can start immediately - no dependencies on other stories
- **User Story 2 (P1)**: Can start immediately - no dependencies on other stories
- **User Story 3 (P2)**: Can start immediately - no dependencies on other stories
- **User Story 5 (P2)**: Can start immediately - no dependencies on other stories
- **User Story 6 (P3)**: Can start immediately - no dependencies on other stories
- **User Story 7 (P3)**: Can start immediately - no dependencies on other stories

### Within Each User Story

- Theme changes (US4) should complete before other visual stories
- Tab navigation (US2) should complete before summary simplification (US3) if both touch MainPanel
- T020 (remove redundant workflow body) depends on T016 (TabBar) — the Workflow tab must remain accessible after body removal
- Core implementation before polish

### Parallel Opportunities

- T001, T002, T003 (US4 theme changes) can run in parallel
- T006, T007, T008, T009 (US1 layout) can run in parallel
- T012, T013, T014 (US2 keybindings) can run in parallel
- T026, T027, T028 (US7 indentation) can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 4 (Dark Theme)

```bash
# Launch all theme role updates together:
Task: "Update theme builtins dark profile to use white (#ffffff) for primary text role in src/ui/theme/builtins.ts"
Task: "Update theme builtins dark profile to use light gray (#9a9a9a) for muted text role in src/ui/theme/builtins.ts"
Task: "Update theme builtins dark profile to use visible accent colors for border and header roles in src/ui/theme/builtins.ts"
```

---

## Implementation Strategy

### MVP First (User Story 4 Only)

1. Complete Phase 3: US4 (Dark Theme)
2. **STOP and VALIDATE**: Verify all text is readable on dark backgrounds
3. Deploy/demo if ready

### Incremental Delivery

1. Complete US4 (Dark Theme) → Visual foundation ready
2. Add US1 (Layout) → Test independently → Deploy/Demo
3. Add US2 (Tabs) → Test independently → Deploy/Demo
4. Add US3 (Summary) → Test independently → Deploy/Demo
5. Add US5 (Naming) → Test independently → Deploy/Demo
6. Add US6 (Heartbeat) → Test independently → Deploy/Demo
7. Add US7 (Indent) → Test independently → Deploy/Demo
8. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes US4 (Dark Theme) together
2. Once US4 is done:
   - Developer A: US1 (Layout) + US2 (Tabs) — both touch MainPanel
   - Developer B: US3 (Summary) + US5 (Naming) — both are quick wins
   - Developer C: US6 (Heartbeat) + US7 (Indent) — both are P3 polish
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
