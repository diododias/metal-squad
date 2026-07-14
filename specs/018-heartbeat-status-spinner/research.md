# Research: Heartbeat Status Spinner

## Decision: Separate session lifecycle from legacy run status

**Decision**: Introduce a canonical `SessionStatus` enum with `running`, `idle`,
`interrupted`, `failed`, `timed_out`, and `completed`. Keep the existing database
`RunStatus` projection for pipeline/statistics compatibility and map the richer
session status into it where necessary.

**Rationale**: The current repository distinguishes `done`, `failed`, `blocked`,
and `aborted`, but cannot represent transient idle or timeout distinctly. A new
session projection satisfies the web/F55/F58 contract without silently changing
existing aggregate semantics.

**Alternatives considered**: Replacing `RunStatus` entirely was rejected because
stats, stale-run repair, pipeline status, and existing consumers already depend
on its values. Inferring status in React from timestamps/output was rejected by
FR-008/FR-010 and would be fragile after reconnect.

## Decision: Use structured event-bus records

**Decision**: Add typed `run:status` and `tool:call` events to the existing event
bus and WebSocket broadcast path. Every record includes `runId` and `featureId`.

**Rationale**: The event bus already carries run start/output/done/failed and the
web server already broadcasts typed event names. Extending this path preserves
the repository's observable-runtime design and gives concurrent runs explicit
identity.

**Alternatives considered**: A browser-only polling loop was rejected because it
would duplicate lifecycle logic and miss adapter-level timeout/abort reasons.
Adding status text to `run:output` was rejected because consumers would still
need to parse or distinguish incidental output.

## Decision: Decouple status detection from animation

**Decision**: `runCli` owns a status tick and last-output timestamp; it emits
status transitions independently of the web `statusSpinner` presentation flag.
The default idle threshold is 30 seconds, and tests can override it through
runtime config/options.

**Rationale**: The current `heartbeatMs = 0` disables its interval, while the
feature requires idle detection even when visual animation is disabled. A local
CSS animation is cheap and does not need periodic backend text events.

**Alternatives considered**: Reusing the existing text heartbeat interval as
both detector and UI payload was rejected because it couples two concerns and
recreates transcript noise. A browser-only idle timer was rejected because the
server must classify aborts/timeouts and persist the current lifecycle.

## Decision: Normalize tool calls at adapter boundaries

**Decision**: Codex, Claude, and OpenCode adapters emit one normalized tool-call
record for lifecycle start/completion/failure, including provider call id when
available, ordered sequence, step/stage, and redacted arguments/output.

**Rationale**: Provider protocols expose different event shapes, while the web
transcript needs one stable contract. Existing adapters already parse provider
events into `run:output`, making them the correct ownership boundary.

**Alternatives considered**: Parsing raw `run:output` lines in the browser was
rejected because legacy OpenCode normalization and provider-specific JSON are
not a durable contract. Implementing provider parsing in `src/web` would violate
layer ownership.

## Decision: Persist normalized calls and current status

**Decision**: Add session-status projection fields to `runs` and a normalized
`run_tool_calls` table, with migrations and repository helpers. Include current
status and historical calls in existing run detail/history payloads.

**Rationale**: The current output stream is persisted, but structured tool-call
identity and lifecycle are not. Persistence is required for reconnects, history,
and a browser that joins after a run has already emitted calls.

**Alternatives considered**: Keeping calls only in React state was rejected by
the history/reconnect acceptance criteria. Encoding calls as JSON inside output
lines was rejected because it retains parsing fragility and cannot cleanly
update start-to-completion records.

## Decision: Use stable client-side group identity

**Decision**: The web client derives groups from `runId + step/stage + group
sequence`; it stores collapsed/expanded state separately from incoming records.

**Rationale**: React state must survive status/output updates and late completion
events. A stable group key prevents a new WebSocket payload from reopening a
group the operator intentionally collapsed.

**Alternatives considered**: Recomputing `open` from each payload was rejected
because it loses operator state. One group per tool call was rejected because it
does not reduce transcript noise or provide the required count summary.

## Decision: Do not add a new external dependency

**Decision**: Use existing Node timers, typed EventEmitter bus, better-sqlite3,
Zod, WebSocket transport, React, and Vitest.

**Rationale**: The repository already has all primitives needed for lifecycle
events, persistence, transport, and animated CSS presentation. Avoiding a new
state-management or animation library keeps the feature within current project
boundaries.

**Alternatives considered**: A third-party spinner or client state library was
rejected as unnecessary for a CSS animation and a run-scoped reducer/state
object.

