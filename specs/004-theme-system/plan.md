# Implementation Plan: Theme System

**Branch**: `004-theme-system` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-theme-system/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Introduce a centralized theme system for the Ink-based TUI so visual styling is no longer hardcoded in each component. Add four built-in themes (`default`, `dark`, `light`, `minimal`), persist the selected theme in the existing JSON config, resolve invalid theme names with a default-theme fallback plus user feedback, and route all component color/border/status styling through shared semantic roles.

## Technical Context

**Language/Version**: TypeScript 5.7.3, Node.js >=20.17.0

**Primary Dependencies**:
- Ink 5.1.0 for terminal rendering (`Text`/`Box` color, border, inverse, dim props)
- React 18.3.1 for the TUI component tree and context propagation
- commander 13.1.0 for CLI entrypoints
- zod 3.24.1 for config parsing and normalization

**Storage**: Persistent JSON config at `~/.config/metal-squad/config.json`; no new database storage

**Testing**: Vitest 3.0.2, ink-testing-library 4.0.0, repo render tests in `tests/ui/*`, config tests in `tests/config/*`

**Target Platform**: Terminal environments running the Ink TUI on macOS, Linux, and Windows shells supported by Node.js

**Project Type**: Single-package CLI application with an interactive TUI

**Performance Goals**:
- Theme resolution happens once at startup and adds no perceptible delay to TUI launch
- Theme lookup during render remains constant-time and does not change existing polling/render cadence
- Built-in themes preserve current readability for status-heavy screens such as run detail, sidebar workflow, and notifications feed

**Constraints**:
- Theme switching is startup-time only; live theme hot-swap is out of scope
- Invalid configured theme names must not make `loadConfig()` fail the entire app
- All user-visible color choices in the current TUI must migrate off hardcoded strings
- The minimal theme must remain understandable in constrained terminal/color environments

**Scale/Scope**:
- 4 built-in theme profiles
- 12 existing TUI files with hardcoded color or border props (`App.tsx`, `format.ts`, and 10+ components under `src/ui/components/`)
- Config schema update plus representative render/config validation coverage

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: PASS

The constitution file at `.specify/memory/constitution.md` is still an unfilled template and does not define enforceable project principles or quality gates. No constitutional violation is detectable before or after design in the current repo state.

## Project Structure

### Documentation (this feature)

```text
specs/004-theme-system/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── theme-system.ts
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── config/
│   └── index.ts                 # Extend persistent config with theme preference input
└── ui/
    ├── App.tsx                  # Resolve active theme and surface fallback notices
    ├── format.ts                # Replace hardcoded status color tables with theme-aware helpers
    ├── components/
    │   ├── CommandPalette.tsx
    │   ├── CostDashboard.tsx
    │   ├── GatePanel.tsx
    │   ├── HelpOverlay.tsx
    │   ├── MainPanel.tsx
    │   ├── NotificationsFeed.tsx
    │   ├── RunTable.tsx
    │   ├── Sidebar.tsx
    │   ├── StatusBar.tsx
    │   └── ...
    └── theme/
        ├── builtins.ts          # New built-in theme profiles
        ├── context.tsx          # Theme provider + hook
        ├── resolve.ts           # Theme preference fallback logic
        ├── styles.ts            # Status/event/component helpers
        └── types.ts             # Theme names, roles, and Ink style contracts

tests/
├── config/
│   └── index.test.ts           # Theme preference loading/fallback coverage
└── ui/
    ├── app.test.ts             # Startup/theme feedback behavior
    ├── render.test.tsx         # Representative themed rendering assertions
    └── components/             # Additional focused component coverage if needed
```

**Structure Decision**: Keep the feature inside the existing single-package TypeScript project. Centralize theme definitions in a dedicated `src/ui/theme/` module so TUI components consume semantic roles through a shared provider/hook instead of importing raw color strings or duplicating palette maps.

## Complexity Tracking

No constitutional violations to justify in the current repo state.

---

## Implementation Summary

### Phase 0: Research

Resolved the design questions that would otherwise block implementation:
- represent theme roles as Ink-compatible semantic style tokens instead of raw per-component colors
- store theme preference in the existing config path while allowing invalid names to fall back safely
- distribute the active theme through a React context instead of prop drilling
- define a reduced but still distinguishable minimal theme for constrained terminals
- validate with config tests and representative Ink render coverage

See [research.md](./research.md) for decisions and tradeoffs.

### Phase 1: Design

Produced the design artifacts needed for implementation:
- [data-model.md](./data-model.md) defines theme preference, resolution, role, and profile entities
- [contracts/theme-system.ts](./contracts/theme-system.ts) defines the TypeScript contract for theme names, Ink style tokens, and resolution behavior
- [quickstart.md](./quickstart.md) documents manual and automated validation scenarios for all built-in themes and fallback behavior

### Agent Context Update

The repo does not currently contain the Spec Kit agent-context extension (`.specify/extensions/agent-context/...`), so there is no agent-context script to execute or managed context block to refresh in this stage.

### Post-Design Constitution Check

**Status**: PASS

The constitution remains an empty template, so the design artifacts introduce no detectable constitutional conflict.

---

## Design Artifacts Generated

| Artifact | Path | Purpose |
|----------|------|---------|
| Plan | `specs/004-theme-system/plan.md` | Technical context, structure, research/design summary |
| Research | `specs/004-theme-system/research.md` | Design decisions and rationale |
| Data Model | `specs/004-theme-system/data-model.md` | Core theme entities and validation rules |
| Contract | `specs/004-theme-system/contracts/theme-system.ts` | Theme system TypeScript interface contract |
| Quickstart | `specs/004-theme-system/quickstart.md` | End-to-end validation scenarios |

---

**Plan Status**: Complete
**Branch**: `004-theme-system`
**Next Command**: `/speckit-tasks`
