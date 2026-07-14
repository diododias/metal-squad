# Quickstart Validation: Heartbeat Status Spinner

This guide validates the feature end to end without launching a nested `msq`
runner. Run from the repository root.

## Prerequisites

- Node.js >=20.17 and installed dependencies.
- A local writable database path.
- A web server started from the built repository.
- A test adapter/process that can produce output, pause, complete, fail, abort,
  and exceed the configured timeout.

## 1. Validate configuration and baseline

```bash
export MSQ_DB_PATH="$(pwd)/.metal-squad/f53-status.sqlite"
rtk npm run build
rtk npm run typecheck
rtk npm run lint
rtk npm test
```

Expected: all commands pass; config parsing exposes `idleThresholdMs` with a
30-second default and accepts a short test override without changing the visual
spinner setting.

## 2. Validate structured lifecycle events

Run the focused suites:

```bash
rtk npx vitest run \
  tests/adapters/spawn.test.ts \
  tests/adapters/codex.test.ts \
  tests/adapters/claude.test.ts \
  tests/adapters/opencode.test.ts \
  tests/core/events-persistence.test.ts \
  tests/db/index-migrate.test.ts
```

Expected assertions:

- Start emits `running` with the correct run and feature identity.
- No output beyond the short threshold emits `idle` within one detector tick.
- New output returns the same run to `running` immediately.
- Abort emits `interrupted`, timeout emits `timed_out`, non-zero exit emits
  `failed`, and successful close emits `completed`.
- Disabling `web.statusSpinner` does not disable detector events.
- Tool calls expose start/completion/failure, stable ids, ordering, step, and
  sanitized arguments/output for all supported adapters.
- SQLite migrations preserve existing runs and reload current status/tool calls.

## 3. Validate WebSocket and concurrent-run isolation

```bash
rtk npx vitest run tests/web/server.test.ts tests/web/status.test.ts
```

Expected: authenticated subscribers receive `run:status` and `tool:call` only
for subscribed runs; two active runs update only their matching cards; a
reconnect/detail request reconstructs status and tool-call history from the
server-side projection.

## 4. Validate the web presentation

Start the web dashboard with the repository's normal command and open a run
detail page:

```bash
rtk npm run web
```

Observe one run through `Running`, `Idle / Waiting`, and each terminal state.
Confirm the card shows elapsed time, idle duration while idle, distinct terminal
labels, and a spinner only when `web.statusSpinner` is enabled. In the transcript,
trigger multiple tool calls in one step, collapse the group, allow more output
and status events to arrive, and confirm it remains collapsed until explicitly
expanded. Expand it and verify original call order, lifecycle phase, and safe
argument/output details.

## Evidence to record

Capture at least:

1. Persisted SQLite rows for the run's final session status and normalized tool
   calls.
2. WebSocket or browser evidence showing the same `runId`/`featureId` on live
   status/tool-call messages and the matching UI card.

