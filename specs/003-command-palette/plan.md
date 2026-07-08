# Implementation Plan: Command Palette & Keyboard Shortcuts

**Branch**: `003-command-palette` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-command-palette/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add a command palette (triggered by `Ctrl+P` or `:`) with fuzzy search over all available commands, alongside comprehensive keyboard shortcuts (global and context-aware). This enables fast command discovery and execution without memorizing all shortcuts, plus context-specific actions for gates/runs. Includes help overlay (`?`) and dynamic status bar hints.

## Technical Context

**Language/Version**: TypeScript 5.7.3, Node.js >=20

**Primary Dependencies**: 
- Ink 5.1.0 (React-based TUI framework)
- React 18.3.1
- commander 13.1.0 (CLI parsing)
- better-sqlite3 11.8.1 (persistence)
- NEEDS CLARIFICATION: Fuzzy search library for command palette filtering

**Storage**: SQLite (better-sqlite3) — not directly relevant to this feature (UI only)

**Testing**: Vitest 3.0.2, with coverage via @vitest/coverage-v8

**Target Platform**: Terminal/console environments (macOS, Linux, Windows with Node.js)

**Project Type**: CLI tool with terminal UI (TUI)

**Performance Goals**: 
- Command palette should open/close instantly (<50ms perceived latency)
- Fuzzy search filtering should feel real-time (<100ms per keystroke)
- Keyboard shortcuts should respond immediately with no input lag

**Constraints**: 
- Must work within Ink's event model and React lifecycle
- Terminal key event handling varies by platform (Ink abstracts most differences)
- Status bar must fit within terminal width (already implemented)
- NEEDS CLARIFICATION: Best fuzzy search algorithm for command palette (weighted scoring, ranking strategy)

**Scale/Scope**: 
- ~15-20 commands in palette initially (run, pause, resume, abort, approve, skip, retry, filter, stats, config, help)
- 3 focus contexts (runs, gates, main) with different active shortcuts
- ~12 global shortcuts + 5 context-specific shortcuts

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: ✅ PASS (constitution template is not populated with specific principles for this project)

The constitution file at `.specify/memory/constitution.md` is a placeholder template and does not define specific enforceable principles for this project. Therefore, no gates can be evaluated at this time.

**Note**: If project-specific constitutional principles are defined in the future, this check should be re-run to verify compliance.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── cli.ts                    # CLI entrypoint (commander)
├── index.ts                  # Main entrypoint
├── commands/                 # CLI command implementations
├── core/
│   ├── backlog/              # Backlog loading, prompt builder
│   ├── orchestrator/         # Pipeline scheduler
│   ├── adapters/             # Tool integrations
│   ├── skills/               # Skill discovery, validation
│   └── events/               # Event bus, observability
├── db/                       # SQLite persistence
├── config/                   # Configuration loading
└── ui/
    ├── App.tsx               # Main TUI component (existing keyboard handling)
    ├── components/
    │   ├── CommandBar.tsx    # Status bar with shortcut hints (existing)
    │   ├── CommandPalette.tsx   # **NEW**: Command palette modal
    │   ├── HelpOverlay.tsx      # **NEW**: Help overlay modal
    │   ├── MainPanel.tsx     # Main content area
    │   ├── Sidebar.tsx       # Sidebar with runs/gates/notifications
    │   ├── GatePanel.tsx     # Gate resolution UI
    │   ├── RunTable.tsx      # Run list table
    │   ├── StatusBar.tsx     # Status bar component
    │   └── ...
    ├── hooks/
    │   ├── useKeyboardShortcuts.ts  # **NEW**: Centralized keyboard handler
    │   ├── useCommandPalette.ts     # **NEW**: Command palette state/logic
    │   ├── useRuns.ts        # Existing hooks
    │   └── ...
    ├── format.ts             # Layout/formatting utilities
    └── catalog.ts            # Feature catalog utilities

tests/
├── ui/
│   ├── app.test.ts           # Main app tests
│   ├── components.test.ts    # Component tests
│   └── hooks.test.ts         # Hook tests
├── commands/                 # Command tests
├── core/                     # Core logic tests
└── db/                       # Database tests
```

**Structure Decision**: Single TypeScript project with CLI tool structure. The UI layer (Ink-based TUI) is where this feature lives. New components (CommandPalette, HelpOverlay) will be added to `src/ui/components/`, and a new hook (`useKeyboardShortcuts`) will centralize keyboard event handling. The existing `App.tsx` has inline `useInput` handling that should be refactored for better separation of concerns.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**Status**: Not applicable — no constitutional violations identified.

The constitution file is a placeholder template with no specific principles defined for this project. No violations to track or justify.

---

## Implementation Summary

### Phase 0: Research ✅

All technical unknowns resolved:
- **Fuzzy search**: Lightweight inline algorithm (no external dependency)
- **Modal overlays**: Conditional rendering with Box layering
- **Keyboard architecture**: Custom `useKeyboardShortcuts` hook with context-aware registry
- **Command availability**: Command objects with `available()` predicates
- **Testing strategy**: Use `ink-testing-library` for integration tests

See [research.md](./research.md) for detailed findings.

### Phase 1: Design ✅

Core entities and contracts defined:
- **Data model**: 5 entities (Command, KeyboardShortcut, FocusContext, CommandPaletteState, HelpOverlayState)
- **Contracts**: TypeScript interfaces in [contracts/types.ts](./contracts/types.ts)
- **Quickstart guide**: End-to-end validation scenarios in [quickstart.md](./quickstart.md)

See [data-model.md](./data-model.md) for entity details.

### Phase 2: Tasks (Not Created in This Command)

Task generation is handled by the `/speckit-tasks` command (separate workflow stage).

---

## Next Steps

1. **Run `/speckit-tasks`** to generate actionable, dependency-ordered tasks for implementation
2. **Implement tasks** via `/speckit-implement` or manual development
3. **Validate** using scenarios in [quickstart.md](./quickstart.md)
4. **Run tests**: `npm test` to verify implementation

---

## Design Artifacts Generated

| Artifact | Path | Purpose |
|----------|------|---------|
| **Plan** | `specs/003-command-palette/plan.md` | This file — technical context, structure, phases |
| **Research** | `specs/003-command-palette/research.md` | Resolved unknowns and design decisions |
| **Data Model** | `specs/003-command-palette/data-model.md` | Core entities, attributes, relationships |
| **Contracts** | `specs/003-command-palette/contracts/types.ts` | TypeScript interface definitions |
| **Quickstart** | `specs/003-command-palette/quickstart.md` | End-to-end validation scenarios |

---

**Plan Status**: ✅ Complete  
**Branch**: `003-command-palette`  
**Next Command**: `/speckit-tasks` to generate implementation tasks
