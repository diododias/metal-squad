# Quickstart: validate feature-specific workflow stages on the Board

## Prerequisites

- Node.js >=20.17 and repository dependencies installed.
- SET-08 is implemented: `KanbanCardRun` accepts `stages` and its card renders
  the compact workflow sequence.
- A focused happy-dom fixture can construct `MsqWebState` with two catalogued
  features, one TODO feature, and an optional run absent from the catalog.

## Focused validation

1. Add/render a Board fixture with two runs in the same status column:
   - `feature-a` stages: `specify`, `implement`
   - `feature-b` stages: `plan`, `validate`
2. Assert the first card contains only `feature-a`'s sequence and the second
   contains only `feature-b`'s sequence.
3. Add a TODO item for a configured feature and assert it receives/renders that
   feature's sequence.
4. Add a run whose `featureId` is absent from `featureCatalog`; assert its card
   remains in the Board without a sequence or rendering error.

Run the focused suite (the exact test file may be added under `tests/web/`):

```bash
rtk npx vitest run tests/web/kanban-card.test.tsx tests/web/client.test.ts
```

## Repository gates

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

Expected outcome: all commands exit successfully; cards in the same board status
can show different feature-owned step sequences, and an unknown catalog feature
still renders safely. See [the component contract](./contracts/board-card-workflow-stages.md)
and [data model](./data-model.md) for the exact mapping.
