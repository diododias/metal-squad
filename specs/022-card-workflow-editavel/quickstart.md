# Quickstart Validation: Card de workflow editável

## Prerequisites

- Node.js >=20.17 and dependencies installed (`npm install`)
- A loaded catalog containing at least one feature with a workflow
- Use the normal global catalog for a real dashboard check; do not use
  `MSQ_DB_PATH` unless the global database is genuinely not writable

## Automated validation

Run the focused behavior tests first:

```bash
rtk npx vitest run tests/web/featureConfigDetail.test.tsx tests/web/server.test.ts tests/db/backlogCatalog.test.ts
```

Expected outcomes:

- each individual workflow field produces the expected sparse patch;
- unchanged values produce no save action;
- valid patches preserve workflow siblings and stages in SQLite;
- invalid merged workflows leave the catalog row unchanged;
- an invalid result is delivered to the card with a useful field message;
- a successful result is followed by refreshed state and a clean baseline.

Run the required TypeScript baseline before implementation is accepted:

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

## Manual web-dashboard scenario

1. Build the project and start the dashboard with an explicit development
   password:

   ```bash
   rtk npm run build
   MSQ_WEB_PASSWORD=local-dev rtk node dist/index.js web --host 127.0.0.1 --port 8743
   ```

2. Open `http://127.0.0.1:8743`, authenticate, and navigate to a feature's
   configuration detail.
3. In **Workflow**, verify that mode, task synchronization, approval destination,
   and **legacy** auto-advance have accessible editable controls with their
   saved values.
4. Change one field, save, and confirm the card shows the updated value without
   a page refresh. Reopen the feature detail and confirm the value persists.
5. Start from a feature with defined stages, switch mode, save, and confirm the
   same stages remain present.
6. Simulate or select an invalid/unavailable destination. Confirm save is
   refused, the card identifies the field to fix, the draft remains visible,
   and the persisted workflow remains unchanged after reopening.
7. Correct the value and save again. Confirm only the intended workflow fields
   changed and the card becomes clean after state refresh.

For field names and wire examples, see
[data-model.md](./data-model.md) and
[contracts/feature-config-websocket.md](./contracts/feature-config-websocket.md).

## Validation note — 2026-07-15

The dashboard server was built and started against an isolated writable SQLite
catalog seeded with a workflow feature. `/api/health` returned `200` and the
password login returned the expected session redirect. The in-app browser was
not available in this execution environment, so the visual click-through could
not be completed here. The focused component, WebSocket, and SQLite tests cover
the same save/reopen and rejected-retry state transitions automatically.
