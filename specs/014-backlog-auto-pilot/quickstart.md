# Quickstart: Backlog Auto-Pilot Validation

## Prerequisites

- Install dependencies once for the repo.
- Use a local DB path so validation does not touch shared global state.
- Load a validation backlog fixture or test setup where at least:
  - two dependency-free features have `autoStart: true`
  - one eligible feature has `autoStart: false`
  - one scenario can trigger a budget protective stop

Recommended environment:

```bash
export MSQ_DB_PATH="$(pwd)/.metal-squad/app.db"
rtk rm -f "$MSQ_DB_PATH" "$MSQ_DB_PATH-wal" "$MSQ_DB_PATH-shm"
rtk npm run build
rtk npm run typecheck
```

## Focused regression suite

Run the focused tests that should prove the feature end to end:

```bash
rtk npx vitest run \
  tests/orchestrator/scheduler.test.ts \
  tests/runner/execute.test.ts \
  tests/web/server.test.ts
```

Expected outcome:

- success handoff starts the next eligible `autoStart` feature
- blocked human-waiting outcomes continue to the next eligible `autoStart` feature
- ordinary execution failures continue to the next eligible `autoStart` feature
- budget or token protective stops prevent any further automatic dispatch
- manual-only features remain pending until started explicitly

## Manual smoke scenario 1: success handoff

1. Load the validation backlog into the local catalog.
2. Start the first `autoStart` feature manually through the CLI or web UI.
3. Let it finish successfully.

Expected outcome:

- the first feature stays `done`
- the next eligible `autoStart` feature begins without another manual command
- no `autoStart: false` feature is started

## Manual smoke scenario 2: blocked or non-budget failure skip

1. Start an `autoStart` feature that will either request human input or fail for an ordinary execution reason.
2. Observe the emitted outcome and the pipeline snapshot.

Expected outcome:

- the original feature remains `blocked` or `failed`
- a different eligible `autoStart` feature starts next
- the blocked or failed feature stays available for manual recovery

## Manual smoke scenario 3: protective stop

1. Start an `autoStart` feature that exceeds a global or feature token budget.
2. Observe the created gate and paused pipeline.

Expected outcome:

- the protective stop is recorded as blocked
- no follow-up automatic feature starts
- recovery still requires an explicit operator action

## Baseline completion commands

Before closing implementation work for this feature, the repo baseline must pass:

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
```

If relevant `src/` TypeScript was touched outside the focused suites above, also run:

```bash
rtk npm run lint
```
