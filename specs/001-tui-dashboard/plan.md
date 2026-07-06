# Implementation Plan: TUI Interativa — Painel de Runs, Tokens e Gates

**Branch**: `001-tui-dashboard` | **Date**: 2026-07-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-tui-dashboard/spec.md`

## Summary

Implement the `msq ui` interactive TUI using ink + React. The TUI polls the existing
SQLite DB every 2 seconds to display real-time pipeline status (US1), token usage per
feature (US2), and allows resolving human decision gates via keyboard shortcuts (US3).
A new `gates` table is added to the DB schema; existing `runs` table gains a `blocked`
status value. No new runtime dependencies are required.

## Technical Context

**Language/Version**: TypeScript 5.7 / Node.js ≥ 20, ESM

**Primary Dependencies**: `ink` 5.x + `react` 18.x (already installed),
`better-sqlite3` (already installed — synchronous reads, no async needed)

**Storage**: SQLite WAL at `~/.local/share/metal-squad/app.db` — read via
`src/db/index.ts` singleton. New `gates` table added via migration in `migrate()`.

**Testing**: `vitest` — unit tests for DB query functions and hook logic (mocked DB)

**Target Platform**: macOS / Linux terminal, minimum 40 columns wide

**Project Type**: CLI / TUI application (single project, no new packages)

**Performance Goals**: DB read cycle < 50ms; TUI mount time < 500ms; polling
interval 2s (configurable); no measurable impact on concurrent `msq run` execution

**Constraints**: No new npm dependencies; WAL mode prevents read/write conflicts;
terminal width ≥ 40 cols minimum supported; exits cleanly without killing bg processes

**Scale/Scope**: Single user, local machine; DB typically < 1000 run rows;
UI renders < 50 rows at once

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|-----------|-------|--------|
| I. Backlog-First | TUI is read-only for active runs; gate actions update DB status only — next `msq run` consults gates. No ad-hoc execution. | ✅ PASS |
| II. Graph-Aware Orchestration | TUI does not bypass the graph or scheduler. Gate approval = DB record; scheduler reads it on next invocation. | ✅ PASS |
| III. Adapter Isolation | TUI reads only from `db/repo.ts` functions, never from adapter internals. New DB functions are in `db/repo.ts`. | ✅ PASS |
| IV. Observability & Auditability | TUI is the primary observability interface — it surfaces runs, tokens, and gates. Gate decisions are persisted to DB. | ✅ PASS |
| V. Secrets Safety | TUI does not read, display, or handle secrets. `src/security/secrets.ts` is not touched. | ✅ PASS |

**Post-design re-check**: All 5 principles pass. No complexity justification required.

## Project Structure

### Documentation (this feature)

```text
specs/001-tui-dashboard/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: ink patterns, gate design decisions
├── data-model.md        # Phase 1: DB schema + RunSummary view
├── quickstart.md        # Phase 1: validation scenarios
├── contracts/
│   └── hooks.md         # Phase 1: hook + DB query + keyboard contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── db/
│   ├── index.ts              # ADD: gates table in migrate(); existing file
│   └── repo.ts               # ADD: listRunsForTui, openGates, resolveGate, createGate
├── ui/
│   ├── App.tsx               # REPLACE placeholder with real layout
│   ├── hooks/
│   │   ├── useRuns.ts        # NEW: polling hook for RunSummary[]
│   │   ├── useGates.ts       # NEW: polling hook for GateRow[] + resolve action
│   │   └── useTerminalWidth.ts  # NEW: responsive layout hook
│   └── components/
│       ├── RunTable.tsx      # NEW: table of features with status/tokens
│       ├── GatePanel.tsx     # NEW: highlighted blocked features + key hints
│       └── EmptyState.tsx    # NEW: "no runs yet" message
└── commands/
    └── ui.ts                 # UNCHANGED — already renders App

tests/
└── db/
    └── repo.test.ts          # ADD: tests for new query functions
```

**Structure Decision**: Single project; changes are additive within existing
`src/ui/` and `src/db/` directories. No new top-level directories required.

## Complexity Tracking

> No Constitution Check violations — this section is intentionally empty.
