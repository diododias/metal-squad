# Implementation Plan: Board cards display feature stages

**Branch**: `029-boardpage-stages` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

## Summary

Make the web Board pass the workflow steps owned by each catalogued feature to
both run and TODO `KanbanCard` instances. `BoardPage` will read
`state.featureCatalog[featureId]?.workflow.stages` at each card boundary; an
unknown feature remains renderable with `stages` omitted. The card's compact
workflow rendering is supplied by prerequisite SET-08 and is intentionally not
reimplemented here.

## Technical Context

**Language/Version**: TypeScript on Node.js >=20.17

**Primary Dependencies**: React 19, Vite-built web client, Vitest with happy-dom

**Storage**: SQLite-backed feature catalog, projected into `MsqWebState` as
`featureCatalog`; no schema or migration change

**Testing**: Vitest focused web component/page tests; repository validation is
`npm run build`, `npm test`, `npm run typecheck`, and `npm run lint`

**Target Platform**: `msq web` browser dashboard, desktop and mobile layouts

**Project Type**: TypeScript CLI with web dashboard

**Performance Goals**: Preserve the current in-memory board rendering path; no
additional catalog queries per card

**Constraints**: UI reads only the already-projected `MsqWebState`; absent
catalog entries and empty stage lists must not crash or invent a fallback
workflow. Board remains status-only per SET-07.

**Scale/Scope**: One web page and its focused tests; two card construction paths
(TODO and persisted run)

## Constitution Check

### Pre-design

- **Source of truth — PASS**: this feature's versioned spec is
  `specs/029-boardpage-stages/spec.md`; catalog workflow data remains the source
  of truth.
- **Layer ownership — PASS**: `BoardPage` owns UI composition and only reads the
  existing state projection. No filesystem, process, database, or backlog-layer
  behavior moves into the UI.
- **Validation — PASS**: changed UI behavior will receive focused automated
  coverage, followed by build, test, typecheck, and lint.
- **Runtime evidence — N/A for the plan**: implementation may use the focused
  UI test suite; a live `msq run` is not required for this presentation-only
  behavior.
- **Harness safety — PASS**: this is ordinary web UI work, not executor
  validation; no nested runner or `msq-develop` flow is planned.
- **UI scope — PASS**: all changes target `src/web/`; no legacy Ink TUI work.

### Post-design

All gates remain satisfied. The design keeps state projection, card rendering,
and page composition in their existing layers and adds no complexity exception.

## Project Structure

### Documentation (this feature)

```text
specs/029-boardpage-stages/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── board-card-workflow-stages.md
```

### Source Code

```text
src/web/
├── state.ts                                  # produces MsqWebState
├── types.ts                                  # state wire types
└── client/
    ├── pages/BoardPage.tsx                   # compose TODO/run cards
    └── components/data/KanbanCard.tsx        # consumes the stages contract

tests/web/
├── kanban-card.test.tsx                      # card rendering contract
└── client.test.ts                            # happy-dom page/client coverage
```

**Structure Decision**: Use the existing web-client layout. The feature touches
only `BoardPage` and focused `tests/web` coverage; state, catalog, persistence,
and API contracts stay unchanged.

## Implementation Sequence

1. Confirm SET-08 is present: `KanbanCardRun` accepts optional `stages` and the
   card renders it through its compact workflow stepper. Current checkout
   inspection shows this prerequisite is not yet in source, so it must land
   before SET-09 implementation; do not duplicate SET-08 in this feature.
2. In the TODO card construction path, pass `f.workflow.stages` to the card
   input while preserving the existing feature identity, tool, effort, and click
   interaction.
3. In the run card construction path, derive `stages` from
   `state.featureCatalog[r.featureId]?.workflow.stages` and pass it with the
   existing run fields. Optional chaining makes unknown catalog entries safe.
4. Add page-level tests with two configured features whose stage arrays differ,
   a TODO card, and a run absent from the catalog. Assert each rendered card gets
   only its own stage sequence and the absent entry still renders.
5. Run focused web tests, then the mandatory build, test, typecheck, and lint
   gates. Keep test fixtures state-only; do not launch a nested `msq` runner.

## Complexity Tracking

No constitution violations or complexity exceptions.
