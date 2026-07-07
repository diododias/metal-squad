---
description: "Task list for F08 Session and Run Navigation"
---

# Tasks: F08 Session and Run Navigation

**Input**: Design documents from `/specs/002-session-run-navigation/`

**Prerequisites**: plan.md, spec.md, data-model.md, research.md, contracts/tui-session-run-navigation.md, quickstart.md

**Tests**: Included — plan.md explicitly requires Vitest coverage for DB read models and keyboard navigation behavior; quickstart.md names the exact test files.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Each task includes the exact file path to create or modify

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing schema coverage and prepare the test fixture used by all navigation tests.

- [ ] T001 Inspect `src/db/index.ts` and `src/db/repo.ts` to confirm `repos`, `runs`, `pipelines`, `run_output`, `run_events`, `task_runs`, and `gates` tables are accessible; document any missing columns needed by the data model
- [ ] T002 Create `tests/fixtures/session-navigation.db` seed script at `tests/fixtures/seed-session-navigation.ts` — at least two repos, one feature with two or more historical runs, one in-progress run with partial metadata

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core navigation types and state-management hooks that all three user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T003 [P] Create `src/types/navigation.ts` — define `NavigationLevel`, `FilterState`, `NavigationSnapshot`, and `ComparisonPair` types matching the data model
- [ ] T004 [P] Extend `src/types/navigation.ts` — add `RepositorySummary`, `FeatureHistoryRecord`, `RunHistoryEntry`, and `RunDetail` read-model types matching the data model
- [ ] T005 Implement `useNavigationStack` hook in `src/ui/hooks/useNavigation.ts` — exports `stack`, `push(snapshot)`, `pop()`, `replaceTop(snapshot)`, and `current` snapshot (depends on T003)
- [ ] T006 [P] Implement `useFilterState` hook in `src/ui/hooks/useFilterState.ts` — per-level `FilterState`, actions `setStatuses`, `setTools`, `setQuery`, `clearAll`; initial state is empty/inactive (depends on T003)

**Checkpoint**: Types and state hooks ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Drill Down Through Navigation Levels (Priority: P1) 🎯 MVP

**Goal**: Operator can navigate from Overview → Repo → Feature → Run using `enter` and return with `esc`, with selection preserved at each level.

**Independent Test**: Open TUI with the fixture DB; navigate to a run using only keyboard; press `esc` three times to return to Overview and confirm prior selection is restored at each level.

### DB Read Queries

- [ ] T007 [P] [US1] Add `listRepoSummaries(db)` to `src/db/repo.ts` — returns `RepositorySummary[]` joined from `repos` + aggregated `runs`/`gates`; only repos with at least one run; sorted by `latestRunAt` desc
- [ ] T008 [P] [US1] Add `listFeaturesForRepo(db, repoId)` to `src/db/repo.ts` — returns `FeatureHistoryRecord[]` for one repo grouped by `feature_id`; enriches `title` from repo-local `backlog.yaml` when present via `src/core/backlog/load.ts`; falls back to `featureId` when backlog is missing

### UI Components

- [ ] T009 [P] [US1] Create `src/ui/components/OverviewPanel.tsx` — renders a scrollable repo list using `RepositorySummary[]`; highlights selected row; shows `repoId`, latest status mix, `latestRunAt`, and tool set per row
- [ ] T010 [P] [US1] Create `src/ui/components/RepoPanel.tsx` — renders a scrollable feature list using `FeatureHistoryRecord[]` for the selected repo; shows `featureId`, optional `title`, `latestStatus`, `runCount`, and `latestRunAt` per row

### Navigation Wiring

- [ ] T011 [US1] Add `j/k` list-movement, `enter` (push next level), and `esc` (pop to parent) keyboard handlers to `useNavigationStack` in `src/ui/hooks/useNavigation.ts` using Ink's `useInput`; movement wraps within current item count (depends on T005)
- [ ] T012 [US1] Update `src/ui/App.tsx` to read `current` level from `useNavigationStack` and render `OverviewPanel`, `RepoPanel`, `FeaturePanel` (stub), or `RunDetailPanel` (stub) accordingly; pass `contextRepoId`/`contextFeatureId` down from the active snapshot (depends on T005, T009, T010)
- [ ] T013 [US1] Implement selection-preservation on `pop()` in `useNavigationStack`: restore `selectedIndex` and `scrollOffset` from the popped snapshot; clamp index to `max(0, items.length - 1)` when the remembered item no longer exists (depends on T005, T011)

### Tests

- [ ] T014 [P] [US1] Write `tests/db/repo-navigation.test.ts` — test `listRepoSummaries` returns only repos with runs, correct aggregated counts, and `availableTools`; test `listFeaturesForRepo` returns only features for the given `repoId` and enriches title from backlog when present
- [ ] T015 [P] [US1] Write `tests/ui/navigation.test.ts` — test `useNavigationStack`: push/pop correctness, `esc` restores prior `selectedIndex`, index clamping when item count shrinks

**Checkpoint**: US1 complete — drill-down and back-navigation fully functional and tested.

---

## Phase 4: User Story 2 — Inspect Historical Run Details (Priority: P2)

**Goal**: Operator can open any feature and see all its historical runs; selecting a run shows the full log, status, tool, duration, token usage, and timestamps; partial/in-progress runs show `Not available yet` for missing fields.

**Independent Test**: Open the fixture feature with multiple runs; open one run detail; confirm all metadata fields render; open the in-progress run and confirm null fields show the placeholder.

### DB Read Queries

- [ ] T016 [P] [US2] Add `listRunsForFeature(db, repoId, featureId)` to `src/db/repo.ts` — returns `RunHistoryEntry[]` for one feature without deduplication; joins `pipelines`, token aggregates, `gates`, and pending `stage_requests`; sorted by `startedAt` desc
- [ ] T017 [P] [US2] Add `getRunDetail(db, runId)` to `src/db/repo.ts` — returns `RunDetail` including `RunHistoryEntry` summary plus `outputLines` from `run_output`, `runEvents` from `run_events`, `taskRuns` from `task_runs`, `outputState` (`full`/`partial`/`empty`), and optional backlog metadata

### UI Components

- [ ] T018 [P] [US2] Create `src/ui/components/FeaturePanel.tsx` — renders a scrollable run history list using `RunHistoryEntry[]`; shows `runId`, `status`, `tool`, `durationLabel`, `totalTokens`, and `startedAt` per row; `space` key marks a row for comparison selection (stub for now)
- [ ] T019 [US2] Create `src/ui/components/RunDetailPanel.tsx` — renders run metadata section (result, tool, duration, tokens, timestamps, stage, pipeline) plus full log in chronological order; renders `Not available yet` for any null field (depends on T017)
- [ ] T020 [US2] Add partial-data handling to `RunDetailPanel` in `src/ui/components/RunDetailPanel.tsx` — when `outputState` is `partial` or `empty`, display a banner indicating the run is still in progress or has no output; never hide the metadata section (depends on T019)

### Navigation Wiring

- [ ] T021 [US2] Update `src/ui/App.tsx` to render `FeaturePanel` at the `feature` level and `RunDetailPanel` at the `run` level; wire `enter` on a `FeaturePanel` row to push a `run` snapshot with `contextRunId`; wire `enter` on a `RepoPanel` row to push a `feature` snapshot (depends on T012, T018, T019)

### Tests

- [ ] T022 [P] [US2] Extend `tests/db/repo-navigation.test.ts` — test `listRunsForFeature` never mixes runs from other repos or features; test token fields are `null` (not zero) for in-progress runs; test `getRunDetail` assembles all sub-queries correctly
- [ ] T023 [P] [US2] Extend `tests/ui/app.test.ts` — test that `RunDetailPanel` renders `Not available yet` for null `endedAt`, `totalTokens`, and `durationLabel`; test `outputState: 'empty'` renders the in-progress banner

**Checkpoint**: US2 complete — feature history and run detail inspection fully functional.

---

## Phase 5: User Story 3 — Compare and Find Runs Quickly (Priority: P3)

**Goal**: Operator can filter by status or tool, search features by id/title, select two runs for comparison, and open a side-by-side diff view; invalid cross-feature comparisons are blocked with an explanation.

**Independent Test**: Open the fixture feature; press `f` and enable `failed`; confirm the list narrows; press `/` and search a feature title; select two runs with `space`; press `c` to open compare and verify result/duration/token diffs; attempt compare with mismatched features and confirm the error message.

### Filter & Search

- [ ] T024 [P] [US3] Create `src/ui/components/FilterBar.tsx` — renders active status badges, active tool badges, and active search query; exposes a `Clear` action; does not render when `FilterState.active` is false
- [ ] T025 [US3] Wire `f` key to open/toggle a status-selection overlay in `FeaturePanel` and `RepoPanel` using `useFilterState`; selected statuses update `FilterState.statuses`; apply filter to the displayed list; show `FilterBar` when active (depends on T006, T024)
- [ ] T026 [US3] Wire `t` key to open/toggle a tool-selection overlay in `FeaturePanel` and `RepoPanel` using `useFilterState`; available tools derived from the current list's `toolSet`; apply filter to the displayed list; show `FilterBar` when active (depends on T006, T024)
- [ ] T027 [US3] Wire `/` key to enter search mode in `RepoPanel` and `FeaturePanel` using `useFilterState`; matches `featureId` and `title` (case-insensitive substring); `backspace` removes last character; `esc` clears query without leaving the current level; show `FilterBar` when active (depends on T006)
- [ ] T028 [US3] Apply the combined `FilterState` (statuses + tools + query) to filter rows in `OverviewPanel`, `RepoPanel`, and `FeaturePanel`; render `EmptyState` with filter-aware message when zero rows match (depends on T025, T026, T027)

### Comparison

- [ ] T029 [P] [US3] Implement `useComparePair` hook in `src/ui/hooks/useComparePair.ts` — state: `selectedRunIds: number[]`, `featureId: string | null`, `repoId: string | null`; action `toggle(run: RunHistoryEntry)` adds/removes a run id (max two); action `validate()` returns `null` if exactly two same-feature runs are selected, otherwise returns an error string
- [ ] T030 [US3] Create `src/ui/components/ComparePanel.tsx` — receives two `RunHistoryEntry` objects; renders side-by-side diff of `status`, `durationLabel`, and `totalTokens`; highlights fields where values differ; shows `Not available yet` for null token/duration fields (depends on T029)
- [ ] T031 [US3] Wire `space` key in `FeaturePanel` to call `toggle()` on `useComparePair`; highlight selected runs visually; wire `c` key to call `validate()` — if valid, push a `compare` snapshot; if invalid, show the validation error in a transient overlay and do not navigate (depends on T029)
- [ ] T032 [US3] Update `src/ui/App.tsx` to render `ComparePanel` at the `compare` navigation level; `esc` from `ComparePanel` pops to the `feature` level and restores selection (depends on T030, T031)

### Tests

- [ ] T033 [P] [US3] Extend `tests/ui/navigation.test.ts` — test `useComparePair.toggle` enforces max-two and same-feature constraint; test `validate()` returns correct error strings for single-run and cross-feature selections; test valid pair pushes `compare` level

**Checkpoint**: US3 complete — filtering, search, and run comparison fully functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Empty states, status bar, and end-to-end validation across all stories.

- [ ] T034 [P] Update `src/ui/components/EmptyState.tsx` to accept a `reason: 'no-history' | 'filter' | 'search' | 'compare-unavailable' | 'invalid-compare'` prop and render level-appropriate copy per the contract (e.g. "No navigable history yet", "No matches — active filters applied")
- [ ] T035 Integrate `EmptyState` with the correct `reason` into `OverviewPanel`, `RepoPanel`, and `FeaturePanel` when their filtered/searched item list is empty in the respective component files
- [ ] T036 [P] Update `src/ui/components/StatusBar.tsx` to reflect the active navigation level label (`Overview / <repoId> / <featureId>`) and show a compact indicator when `FilterState.active` is true
- [ ] T037 Run quickstart.md automated suite: `npm run test -- tests/db/repo-navigation.test.ts tests/ui/navigation.test.ts tests/ui/app.test.ts` — all tests green; then run manual Scenario 1 (drill down + return), Scenario 2 (filter + search), Scenario 3 (compare), and Scenario 4 (invalid compare) against the fixture DB

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — blocks all user stories
- **User Stories (Phase 3–5)**: All depend on Foundational completion
  - US1 (P1) → US2 (P2) → US3 (P3) in priority order, or in parallel if staffed
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no dependency on US2 or US3
- **US2 (P2)**: Can start after Foundational — builds on DB pattern from US1 but shares no state; independently testable
- **US3 (P3)**: Can start after Foundational — `FilterBar` and `useComparePair` are independent of US1/US2 run queries

### Within Each User Story

- DB read queries before UI components that consume them
- UI components before navigation wiring in `App.tsx`
- Tests written alongside or after their corresponding implementation tasks

### Parallel Opportunities

- T003 and T004 (types) can run in parallel
- T005 and T006 (hooks) can run in parallel once T003 is done
- T007 and T008 (DB queries, US1) can run in parallel
- T009 and T010 (panel components, US1) can run in parallel
- T014 and T015 (tests, US1) can run in parallel with implementation
- T016 and T017 (DB queries, US2) can run in parallel
- T018 (FeaturePanel) can run in parallel with T019/T020 (RunDetailPanel)
- T024 (FilterBar), T029 (useComparePair) can run in parallel
- T034 and T036 (polish) can run in parallel

---

## Parallel Example: User Story 1

```bash
# DB queries together:
Task T007: Add listRepoSummaries() to src/db/repo.ts
Task T008: Add listFeaturesForRepo() to src/db/repo.ts

# Panel components together (after T003/T004 types exist):
Task T009: Create src/ui/components/OverviewPanel.tsx
Task T010: Create src/ui/components/RepoPanel.tsx

# Tests alongside implementation:
Task T014: Write tests/db/repo-navigation.test.ts
Task T015: Write tests/ui/navigation.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (fixture DB)
2. Complete Phase 2: Foundational (types + hooks)
3. Complete Phase 3: US1 — drill down and back-navigation
4. **STOP and VALIDATE**: `npm run test -- tests/db/repo-navigation.test.ts tests/ui/navigation.test.ts` and manual Scenario 1
5. Ship if drill-down alone meets operator needs

### Incremental Delivery

1. Setup + Foundational → state scaffold ready
2. US1 → drill-down working → validate → demo (MVP)
3. US2 → run detail view → validate → demo
4. US3 → filtering, search, comparison → validate → demo
5. Polish → empty states, status bar, end-to-end validation

### Parallel Team Strategy

With multiple developers after Foundational:

- Developer A: US1 (navigation stack, OverviewPanel, RepoPanel)
- Developer B: US2 (run queries, FeaturePanel, RunDetailPanel)
- Developer C: US3 (FilterBar, useComparePair, ComparePanel)

---

## Notes

- `[P]` tasks operate on different files and have no incomplete-task dependencies
- `[Story]` label maps each task to its user story for traceability
- `src/db/repo.ts` already exists — add new exported functions, do not replace existing ones
- `src/ui/components/EmptyState.tsx` already exists — extend with a `reason` prop rather than creating a new file
- `tests/ui/app.test.ts` already exists — add test cases to the existing suite rather than creating a duplicate
- Selection preservation (`esc` restores prior row) is enforced in `useNavigationStack`, not in individual panels
- Backlog metadata enrichment is best-effort: always fall back gracefully when `backlog.yaml` is absent or the feature entry is missing
