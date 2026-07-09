# Implementation Plan: Detail Screen UX Improvements

**Branch**: `005-detail-screen-ux` | **Date**: 2026-07-08 | **Spec**: `/specs/005-detail-screen-ux/spec.md`

**Input**: Feature specification from `/specs/005-detail-screen-ux/spec.md`

## Summary

This feature delivers 7 user stories across the Ink-based terminal UI: responsive layout adaptation (US1), tab-based section navigation (US2), compact run summary (US3), dark theme readability fix (US4), consistent tool naming (US5), simplified heartbeat display (US6), and kanban card indentation (US7). The primary technical approach is updating existing Ink components (MainPanel, KanbanCard, WorkflowStepper) and theme builtins rather than introducing new architecture.

## Technical Context

**Language/Version**: TypeScript 5.7.3, Node.js >=20.17.0

**Primary Dependencies**: Ink 5.1.0 (React-based terminal UI), React 18.3.1, better-sqlite3, commander, zod, yaml

**Storage**: SQLite (better-sqlite3) — local database; no schema changes required for this feature

**Testing**: Vitest 3.0.2, ink-testing-library 4.0.0

**Target Platform**: Cross-platform terminal (macOS, Linux, Windows)

**Project Type**: CLI application (terminal UI desktop app)

**Performance Goals**: Responsive terminal UI rendering; no specific latency targets — visual updates must feel instant (<16ms frame budget)

**Constraints**: Must adapt to terminal widths 80–120+ columns; Ink framework limits (no native scroll containers, box model constraints); number key range (1-7) must match `DETAIL_SECTION_ORDER.length` (currently 7 sections)

**Scale/Scope**: Single-user local CLI tool; manages AI development pipelines with multiple concurrent runs

## Constitution Check

*GATE: Must pass before research. Re-check after design.*

The project constitution (`.specify/memory/constitution.md`) contains only placeholder template values — no actual principles are defined. **Gate passes by default** — no constitution violations to evaluate.

## Project Structure

### Documentation (this feature)

```text
specs/005-detail-screen-ux/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (component contracts)
└── tasks.md             # Phase 2 output (already created by /speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── ui/
│   ├── App.tsx                      # Main app — layout, state, section routing
│   ├── detailSections.ts            # DETAIL_SECTION_ORDER, DetailSectionId, labels
│   ├── format.ts                    # Text formatting, heartbeat line formatting
│   ├── workflow.ts                  # Workflow stage types, summaries
│   ├── catalog.ts                   # Feature catalog logic
│   ├── dashboardGroups.ts           # Dashboard grouping
│   ├── commands/
│   │   ├── runShortcuts.ts          # Run-detail keyboard shortcuts (j/k/p/x/i)
│   │   ├── viewShortcuts.ts         # View-level shortcuts
│   │   ├── gatesShortcuts.ts        # Gate shortcuts
│   │   ├── globalShortcuts.ts       # Global shortcuts
│   │   ├── definitions.ts           # Shortcut definitions
│   │   └── registry.ts              # Shortcut registry
│   ├── components/
│   │   ├── MainPanel.tsx            # Detail screen — metric cards, sections (29K)
│   │   ├── KanbanCard.tsx           # Kanban board card — tool/model display
│   │   ├── WorkflowStepper.tsx      # Pipeline progress stepper
│   │   ├── HeaderBar.tsx            # Top header
│   │   ├── StatusBar.tsx            # Bottom status bar
│   │   └── ... (13 more components)
│   ├── hooks/
│   │   ├── useKeyboardShortcuts.ts  # Keyboard shortcut handler (7.4K)
│   │   ├── useTerminalWidth.ts      # Terminal width detection
│   │   └── ... (11 more hooks)
│   ├── theme/
│   │   ├── builtins.ts              # Theme definitions (default, dark, light, minimal)
│   │   ├── types.ts                 # ThemeProfile, ThemeRoleName, etc.
│   │   ├── context.tsx              # useTheme() hook
│   │   ├── resolve.ts               # Theme resolution logic
│   │   └── styles.ts                # Style utilities
│   ├── types/                       # Type definitions
│   └── utils/                       # Utility functions
├── index.ts                         # CLI entry point
└── ... (other source files)

tests/
├── unit/
├── integration/
└── contract/
```

**Structure Decision**: Single project structure — `src/ui/` contains all terminal UI code. This feature modifies existing files only; the TabBar component (US2) is defined inline within `MainPanel.tsx`, not as a separate file. No new source directories or files are required.

## Complexity Tracking

> **No constitution violations** — section left empty.
