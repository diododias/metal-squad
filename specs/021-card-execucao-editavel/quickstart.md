# Quickstart: Validate the editable execution card

## Prerequisites

- Node.js >=20.17 and repository dependencies installed.
- A loaded catalog with a feature available in the web dashboard.
- The web dashboard can be started with the repository's normal local workflow.

## Automated validation

Run the affected checks first:

```bash
rtk npx vitest run tests/web/editable-controls.test.tsx tests/web/server.test.ts tests/db/backlogCatalog.test.ts
```

Then run the repository gates required for changed TypeScript source:

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

## End-to-end scenarios

1. Open a feature detail in the web dashboard. Change each of `tool`, `model`,
   `effort`, `maxTokens`, and `autoStart` individually, save, and verify that the
   displayed value changes in the same interaction.
2. Change only `effort`, save, then confirm the other four execution values are
   unchanged. This validates the sparse patch in the [WebSocket
   contract](./contracts/websocket-feature-config.md).
3. Modify a field and restore its prior value. Confirm the modified indicator is
   removed and saving does not dispatch a write.
4. Attempt to save an empty, non-numeric, non-integer, or non-positive token
   limit. Confirm the card shows correction guidance, keeps the draft, and does
   not save.
5. Exercise an unavailable saved tool value. Confirm it remains understandable,
   cannot be resaved unchanged as a new invalid selection, and becomes saveable
   after choosing a supported tool.
6. Force or observe a persistence failure. Confirm the dashboard shows the
   existing failure notice and retains the unsaved draft.

See [data-model.md](./data-model.md) for state transitions and
[websocket-feature-config.md](./contracts/websocket-feature-config.md) for the
transport and server outcomes.

## Implementation verification notes (2026-07-15)

- Automated coverage passed for individual sparse patches, saved-baseline
  reconciliation, dirty-state reversion, invalid token values (empty,
  non-numeric, non-integer, and non-positive), unavailable tools, WebSocket
  reconciliation, and atomic catalog rejection.
- A browser-backed manual pass could not be run in this execution environment
  because no browser surface was available. T015 remains open for that visual
  confirmation; the automated component and integration coverage above provides
  the recorded equivalent behavior evidence.
