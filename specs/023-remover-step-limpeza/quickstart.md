# Quickstart: Validate workflow-step removal

## Prerequisites

- Node.js >=20.17 and project dependencies installed (`npm install`).
- A local writable test database is used by the existing test fixtures; no production catalog mutation is required.

## Focused automated validation

From the repository root, run:

```bash
npx vitest run tests/web/featureConfigDetail.test.tsx tests/web/server.test.ts tests/db/backlogCatalog.test.ts tests/db/repo-extended.test.ts tests/runner/execute.test.ts
npm run build
npm test
npm run typecheck
npm run lint
```

Expected results:

- Component tests prove the close control emits one composed patch, preserves unrelated settings, moves selection, and blocks the final stage.
- Server and catalog tests prove `sessionPolicy` crosses the narrow WebSocket contract and invalid dangling references roll back atomically.
- Repository/runner tests prove a paused pipeline resumes its captured workflow revision while a newly created pipeline uses the later saved revision.
- Build, test, typecheck, and lint complete successfully.

## Manual dashboard scenario

1. Start the dashboard using the repository's documented `msq web` command and open the editable feature configuration.
2. Create a workflow with at least two stages; give one selected stage guidance and mark it in `sessionPolicy.alwaysIsolatedStages`.
3. Use that stage's close control and wait for the successful configuration-save acknowledgement/state refresh.
4. Verify the stage is absent, the remaining stage settings are unchanged, and saving does not show an invalid-reference error.
5. Repeat with the only remaining stage and verify its close control is disabled with explanatory feedback and no state change.
