# Quickstart: Validate workflow-step reordering

## Prerequisites

- Node.js >=20.17 and project dependencies installed (`npm install`).
- Use the existing test fixtures and local writable test database; do not alter
  the shared production catalog for automated validation.

## Focused automated validation

From the repository root, run:

```bash
npx vitest run tests/web/featureConfigDetail.test.tsx tests/web/server.test.ts tests/db/backlogCatalog.test.ts tests/runner/execute.test.ts
npm run build
npm test
npm run typecheck
npm run lint
```

Expected results:

- Component tests prove the reordered sequence previews before saving, boundary
  controls do nothing, and one minimal stages-only patch is dispatched.
- Component and server tests prove failed saves retain the draft with feedback
  and successful refreshes establish the new baseline.
- Catalog tests prove the persisted sequence changes while guidance and
  isolation settings remain attached to their stage names.
- Runner tests prove a pipeline created before the save retains its snapshot
  order, while a pipeline created afterward uses the saved order.
- Build, test, typecheck, and lint finish successfully.

## Manual dashboard scenario

1. Start the documented `msq web` dashboard and open an editable feature.
2. Ensure its workflow has at least three steps; give one non-edge step both
   guidance and an isolation setting.
3. Use its move-up or move-down control. Verify the displayed pill order changes
   before any save and that a `save step order` action is available.
4. Save, wait for the success acknowledgement and refreshed state, then reopen
   the feature. Verify the order remains changed and the selected step retains
   its guidance/isolation setting.
5. Try moving the first step up and the last step down. Verify those controls
   are disabled and no configuration update occurs.
6. For a pipeline already in progress, save a different order and then resume
   it. Verify it continues its original sequence; start a new pipeline and
   verify it uses the saved sequence.
