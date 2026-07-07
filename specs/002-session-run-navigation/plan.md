# Implementation Plan: F08 Session and Run Navigation

**Branch**: `002-session-run-navigation` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-session-run-navigation/spec.md`

## Summary

Add a hierarchical TUI navigation flow that lets operators move from repo
overview to feature history and run detail, then compare two runs from the same
feature, by introducing navigation-specific SQLite read models and replacing the
current flat run selection state with a stack-based view state that preserves
selection, filters, and search context per level.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js >=20

**Primary Dependencies**: Ink 5.1, React 18.3, better-sqlite3, commander,
Vitest, Zod, YAML

**Storage**: SQLite (`runs`, `repos`, `pipelines`, `run_output`, `run_events`,
`task_runs`, `gates`) plus repo-local `backlog.yaml` metadata

**Testing**: Vitest unit/integration-style tests in `tests/db`, `tests/ui`, and
`tests/commands`

**Target Platform**: Cross-platform terminal-based CLI/TUI for local developer
machines

**Project Type**: CLI/TUI application

**Performance Goals**: Keyboard navigation remains immediate, list refresh stays
within the current 2-second polling cycle, and operators can reach a target run
within the spec goals of 30 seconds and 3 interaction steps for narrowing

**Constraints**: Preserve the F05 multi-panel shell, keep operator-facing text
in English, support `j/k`, `enter`, and `esc` as primary navigation controls,
preserve selection when moving back up the hierarchy, compare exactly two runs
from the same feature, and degrade gracefully when DB fields or backlog metadata
are missing

**Scale/Scope**: One new navigation system spanning `Overview -> Repo -> Feature
-> Run`, filter/search state for list levels, one comparison view for two runs,
and supporting DB read queries over existing persisted history

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- `.specify/memory/constitution.md` is still the default template placeholder,
  with no ratified principles or enforceable governance rules.
- No explicit constitutional gates can be evaluated from the current file.
- Working gates applied for this plan instead:
  - Keep the existing single-project TypeScript CLI/TUI structure.
  - Reuse existing SQLite persistence instead of adding a new service.
  - Keep all new operator copy in English.
  - Add Vitest coverage for DB read models and keyboard navigation behavior.
- Pre-design gate status: PASS
- Post-design re-check status: PASS. The planned design stays within the
  existing repo architecture and adds no extra runtime surface beyond the TUI
  and SQLite read layer.

## Project Structure

### Documentation (this feature)

```text
specs/002-session-run-navigation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── tui-session-run-navigation.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── commands/
├── config/
├── core/
│   ├── adapters/
│   ├── backlog/
│   ├── budget/
│   ├── events/
│   ├── notify/
│   ├── orchestrator/
│   ├── runner/
│   └── skills/
├── db/
└── ui/
    ├── components/
    └── hooks/

tests/
├── commands/
├── db/
├── runner/
└── ui/
```

**Structure Decision**: Keep the current single-project CLI/TUI layout. Add
navigation read models in `src/db/repo.ts`, new navigation/view-state hooks in
`src/ui/hooks/`, and compose the hierarchy inside `src/ui/App.tsx` plus the
existing `MainPanel`, `Sidebar`, `RunTable`, `StatusBar`, and new comparison or
filter presentation components as needed.

## Complexity Tracking

No constitution violations or exceptional complexity justifications are required
for this design.
