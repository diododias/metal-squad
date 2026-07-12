# Implementation Plan: Backlog Auto-Pilot

**Branch**: `014-backlog-auto-pilot` | **Date**: 2026-07-12 | **Spec**: [`specs/014-backlog-auto-pilot/spec.md`](./spec.md)

**Input**: Feature specification from `/specs/014-backlog-auto-pilot/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add a per-feature `autoStart` opt-in and an outcome-driven auto-pilot controller that reuses the existing dependency order, starts the next eligible automatic feature after qualifying outcomes, skips over human-waiting or non-budget failures, and stops on budget or token protective conditions. The implementation stays inside the current orchestrator and runner lifecycle, while exposing the new flag through backlog/catalog and web feature config surfaces.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js >=20.17.0

**Primary Dependencies**: `zod`, `yaml`, `better-sqlite3`, `commander`, `react`, `ink`, `ws`

**Storage**: Backlog YAML loaded into SQLite catalog tables plus JSON config under `~/.config/metal-squad/config.json`

**Testing**: `vitest`, `tsc --noEmit`, `eslint`

**Target Platform**: Local developer CLI plus long-lived local web/TUI surfaces on Node.js

**Project Type**: CLI/workflow orchestrator with SQLite-backed state and web/TUI control surfaces

**Performance Goals**: Dispatch the next eligible automatic feature within the same scheduler/poll cycle after a qualifying outcome, without requiring a fresh manual command

**Constraints**: Preserve deterministic topological ordering, do not auto-start manual-only features, do not bypass existing budget/token protective stops, and avoid duplicate starts for features that are already active or already counted as done

**Scale/Scope**: Single-repo backlog currently holding 10 feature entries, with a small number of concurrent active runs and feature-level automation only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- `.specify/memory/constitution.md` is still the default placeholder template, so it defines no enforceable project-specific principles today.
- Operational gates were derived from repo rules instead:
  - Keep orchestration logic inside `src/core/orchestrator/`, `src/core/runner/`, and `src/core/events/`, not in CLI or UI layers.
  - Any backlog contract change must update schema, catalog/web consumers, and focused tests together.
  - Code changes must validate with `rtk npm run build`, `rtk npm test`, and `rtk npm run typecheck`; add `rtk npm run lint` when touching relevant `src/` TypeScript.
- Pre-design gate result: PASS
- Post-design gate result: PASS
- Agent-context update step: skipped intentionally because `.specify/extensions/agent-context/` is not installed in this checkout, so there is no local script to run.

## Project Structure

### Documentation (this feature)

```text
specs/014-backlog-auto-pilot/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── backlog-auto-start.md
│   └── autopilot-events.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── commands/
│   ├── run.ts
│   └── web.ts
├── core/
│   ├── backlog/
│   │   ├── load.ts
│   │   └── schema.ts
│   ├── events/
│   │   ├── bus.ts
│   │   ├── logging.ts
│   │   ├── persistence.ts
│   │   └── types.ts
│   ├── orchestrator/
│   │   ├── graph.ts
│   │   ├── scheduler.ts
│   │   └── autoPilot.ts        # new
│   └── runner/
│       └── execute.ts
├── db/
│   ├── backlogCatalog.ts
│   └── repo.ts
└── web/
    ├── server.ts
    ├── state.ts
    ├── types.ts
    └── static/components/FeaturePreview.js

tests/
├── orchestrator/
│   └── scheduler.test.ts
├── runner/
│   └── execute.test.ts
└── web/
    └── server.test.ts
```

**Structure Decision**: Keep eligibility, next-feature selection, and outcome classification in core orchestration modules so the CLI, web server, and future automation hooks all consume one source of truth. Persist the new feature flag through existing backlog/catalog JSON rather than adding a parallel table or daemon-only state store.

## Complexity Tracking

No constitution violations or exceptional complexity waivers are required for this design.
