# Tasks: TUI Interativa — Painel de Runs, Tokens e Gates

**Input**: Design documents from `/specs/001-tui-dashboard/`

**Prerequisites**: plan.md ✅, spec.md ✅, data-model.md ✅, contracts/hooks.md ✅, research.md ✅, quickstart.md ✅

**Tests**: Unit tests are included per plan.md (vitest, mocked DB) — not TDD/write-first; tests are generated alongside or after implementation.

**Organization**: Tasks grouped by user story. Each story phase is independently testable.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: User story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Extend DB schema with the `gates` table — required before any gate logic or migration-aware tests can run.

- [X] T001 Add `gates` table `CREATE TABLE IF NOT EXISTS` DDL to `migrate()` in `src/db/index.ts`

---

## Phase 2: Foundational (DB Query Layer)

**Purpose**: All DB query functions and TypeScript types that TUI hooks depend on. Every user story phase depends on this phase completing first.

**⚠️ CRITICAL**: No UI hook can be implemented until DB functions are available here.

- [X] T002 Add `RunSummary` TypeScript interface export to `src/db/repo.ts`
- [X] T003 Implement `listRunsForTui(limit?: number): RunSummary[]` query (LEFT JOIN runs + token_usage + open gates, ORDER BY runs.id DESC, default LIMIT 50) in `src/db/repo.ts`
- [X] T004 Add `GateRow` interface and `GateDecision` type exports to `src/db/repo.ts`
- [X] T005 Implement `openGates(): GateRow[]` SELECT function (WHERE resolved_at IS NULL, ORDER BY created_at ASC) in `src/db/repo.ts`
- [X] T006 Implement `resolveGate(id: number, decision: GateDecision): void` UPDATE function (sets resolved_at + decision atomically, no-op if already resolved) in `src/db/repo.ts`
- [X] T007 Implement `createGate(runId: number, featureId: string, repoId: string): number` INSERT function (returns new gate id) in `src/db/repo.ts`

**Checkpoint**: DB layer complete — UI hook development can begin in parallel

---

## Phase 3: User Story 1 — Monitor Pipeline em Tempo Real (Priority: P1) 🎯 MVP

**Goal**: `msq ui` opens and shows all features of the most recent pipeline run with auto-refreshing status, elapsed time for running features, and visual distinction between statuses.

**Independent Test**: Start `msq run` in Terminal 2; verify Terminal 1 shows live status updates within 3 seconds. Verify empty-state message appears when no runs exist (quickstart.md Scenario 1 + 2).

- [X] T008 [US1] Implement `useRuns(intervalMs?: number): RunSummary[]` polling hook (`setInterval` + synchronous `better-sqlite3` read, cleans up on unmount) in `src/ui/hooks/useRuns.ts`
- [X] T009 [P] [US1] Implement `useTerminalWidth(): number` hook (reads `process.stdout.columns`, defaults to 80, updates on stdout `resize` event) in `src/ui/hooks/useTerminalWidth.ts`
- [X] T010 [P] [US1] Create `EmptyState` component rendering guidance message "No runs yet — run `msq run` first" in `src/ui/components/EmptyState.tsx`
- [X] T011 [US1] Create `RunTable` component with full layout (feature_id | tool | status | duration — for ≥ 60 cols) and compact layout (feature_id | status — for < 60 cols) with distinct status icons/colors in `src/ui/components/RunTable.tsx`
- [X] T012 [US1] Replace `App.tsx` placeholder with real layout: wire `useRuns` + `useTerminalWidth`, render `RunTable` when runs exist or `EmptyState` otherwise in `src/ui/App.tsx`
- [X] T013 [US1] Add `useInput` keyboard handler for `q` → `process.exit(0)` exit in `src/ui/App.tsx`
- [X] T014 [P] [US1] Write vitest unit tests for `listRunsForTui` with mocked `better-sqlite3` (empty result, running row, done row with tokens) in `tests/db/repo.test.ts`

**Checkpoint**: User Story 1 complete — `msq ui` shows live pipeline status and exits cleanly with `q`

---

## Phase 4: User Story 2 — Visualizar Uso de Tokens por Feature (Priority: P2)

**Goal**: Each completed feature shows its formatted total token count; running/failed/blocked features show `—`. Only the most recent run per feature per repo is shown by default.

**Independent Test**: Open `msq ui` after a completed `msq run`. Verify token counts match DB query: `SELECT r.feature_id, u.total FROM runs r LEFT JOIN token_usage u ON u.run_id = r.id ORDER BY r.id DESC LIMIT 5;` (quickstart.md Scenario 3).

- [X] T015 [US2] Add `totalTokens` column to `RunTable`: formatted count (e.g. `1.2k`) for `done` runs, `—` for all other statuses; hidden in compact layout (< 60 cols) in `src/ui/components/RunTable.tsx`
- [X] T016 [US2] Add "most recent run per feature per repo" deduplication to `listRunsForTui` query (CTE or subquery: MAX(id) GROUP BY repo_id, feature_id) in `src/db/repo.ts`
- [X] T017 [P] [US2] Write vitest unit tests for token column formatting and run deduplication logic in `tests/db/repo.test.ts`

**Checkpoint**: User Story 2 complete — token costs visible per completed feature; only latest run per repo shown

---

## Phase 5: User Story 3 — Agir em Gates de Decisão Humana (Priority: P3)

**Goal**: Blocked features are highlighted in the TUI with gate action hints; user resolves them with `a`/`s`/`r` keyboard shortcuts without leaving the TUI. Resolution is persisted to DB.

**Independent Test**: Insert blocked run + gate via SQL (quickstart.md Scenario 4), open `msq ui`, verify gate is highlighted with key hints, press `a`, verify `SELECT decision, resolved_at FROM gates ORDER BY id DESC LIMIT 1` returns `approved | <timestamp>`.

- [X] T018 [US3] Implement `useGates(intervalMs?: number): { gates: GateRow[], resolve: ResolveGateFn }` hook (synchronous `resolveGate` call triggers immediate re-poll, idempotent) in `src/ui/hooks/useGates.ts`
- [X] T019 [P] [US3] Create `GatePanel` component: highlighted blocked features list, arrow-key selection indicator, `[a]pprove [s]kip [r]etry` key hints in `src/ui/components/GatePanel.tsx`
- [X] T020 [US3] Wire `App.tsx` with `useGates`, render `GatePanel` below `RunTable` when `gates.length > 0` in `src/ui/App.tsx`
- [X] T021 [US3] Add `useInput` handlers for `↑`, `↓` (gate selection navigation), `a` (approved), `s` (skipped), `r` (retried) — all no-ops when no gates visible in `src/ui/App.tsx`
- [X] T022 [P] [US3] Write vitest unit tests for `openGates`, `resolveGate` (idempotency, atomicity), and `createGate` with mocked DB in `tests/db/repo.test.ts`

**Checkpoint**: User Story 3 complete — gates resolvable from TUI, decisions persisted to DB

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Type safety verification and quickstart validation across all edge cases.

- [X] T023 Run `tsc --noEmit` and fix any TypeScript type errors across all new and modified files in `src/ui/` and `src/db/`
- [X] T024 [P] Validate quickstart.md Scenario 1 (empty state), Scenario 5 (narrow terminal ≤ 45 cols renders without artifacts), and Scenario 6 (exit TUI does not kill active `msq run`)
- [X] T025 [P] Validate edge cases from spec: DB locked state shows graceful warning; no-init state (missing DB) shows `msq init` guidance

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories (hooks need DB functions)
- **US1 (Phase 3)**: Depends on Phase 2 — requires T002–T003 (`RunSummary` + `listRunsForTui`)
- **US2 (Phase 4)**: Depends on Phase 2 + US1 — modifies `RunTable` (T011) and `repo.ts` (T003/T016)
- **US3 (Phase 5)**: Depends on Phase 2 + US1 — requires T004–T007 (gate DB functions) and T012–T013 (`App.tsx` base)
- **Polish (Phase 6)**: Depends on all user story phases complete

### User Story Dependencies

- **US1 (P1)**: Requires T002 (`RunSummary`) and T003 (`listRunsForTui`)
- **US2 (P2)**: Requires T011 (`RunTable` base structure) and T003 (`totalTokens` already in join query)
- **US3 (P3)**: Requires T004–T007 (gate types + DB functions) and T012–T013 (`App.tsx` wiring + keyboard base)

### Within Each User Story

- T008 (`useRuns`) before T012 (`App.tsx` wiring)
- T009, T010 parallel with T008 — different files, no dependency
- T011 (`RunTable`) before T012 (`App.tsx` needs component)
- T012 before T013 (keyboard handler extends `App.tsx`)
- T015 (tokens in `RunTable`) after T011 — modifies same file sequentially
- T018 (`useGates`) before T020 (`App.tsx` gate wiring)
- T019 (`GatePanel`) parallel with T018 — different file
- T020 before T021 (gate keyboard handlers need `App.tsx` gate wiring)

### Parallel Opportunities

Within Phase 3 (after Phase 2 complete):
- T009 + T010 run in parallel with T008 (all different files)
- T014 (tests) runs in parallel with T009–T013 (`tests/db/` vs `src/ui/`)

Within Phase 4:
- T017 (tests) runs in parallel with T015 (different files)

Within Phase 5:
- T019 (`GatePanel.tsx`) runs in parallel with T018 (`useGates.ts`)
- T022 (tests) runs in parallel with T019–T021 (different file)

Note: `tests/db/repo.test.ts` is a shared file across T014, T017, T022 — these are sequential relative to each other.

---

## Parallel Example: User Story 1

```bash
# After Phase 2 (Foundational) complete:

# These run in parallel (all different files):
Task T008: src/ui/hooks/useRuns.ts
Task T009: src/ui/hooks/useTerminalWidth.ts
Task T010: src/ui/components/EmptyState.tsx
Task T014: tests/db/repo.test.ts (listRunsForTui tests)

# Then, after T008 + T009 contracts are clear:
Task T011: src/ui/components/RunTable.tsx

# Then, after T008 + T011 complete:
Task T012: src/ui/App.tsx (wire layout)
Task T013: src/ui/App.tsx (add q exit — after T012)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: `gates` table migration
2. Complete Phase 2: DB query layer (T002–T007)
3. Complete Phase 3: US1 — live pipeline monitor with exit key
4. **STOP and VALIDATE**: `msq ui` shows runs, updates live, exits cleanly with `q`
5. Ship if this delivers standalone value

### Incremental Delivery

1. Setup + Foundational → DB layer ready
2. US1 → `msq ui` shows live pipeline status (MVP!)
3. US2 → Token costs visible per completed feature
4. US3 → Gates resolvable from TUI (full feature complete)
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

Once Phase 2 is complete:

- Developer A: US1 (hooks + RunTable + App wiring + exit key)
- Developer B: US2 (token column + deduplication, can start after T011 is done)
- Developer C: US3 (useGates + GatePanel, can start immediately after Phase 2)

---

## Notes

- `[P]` = tasks touching different files, no shared dependencies — safe to run concurrently
- `[USn]` = maps to user story n for traceability
- `tests/db/repo.test.ts` is shared across T014, T017, T022 — these three tasks are sequential relative to each other
- `src/db/repo.ts` is extended in Phase 2 (T002–T007) and again in Phase 4 (T016) — coordinate to avoid merge conflicts
- All DB reads use the existing `getDb()` singleton — do not open a second connection in the TUI process
- WAL mode is already configured in `src/db/index.ts` — no additional DB setup needed for concurrent TUI + `msq run` access
- `src/commands/ui.ts` is explicitly UNCHANGED per plan.md — do not modify it
