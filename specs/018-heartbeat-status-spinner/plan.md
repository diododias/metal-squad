# Implementation Plan: Heartbeat Status Spinner

**Branch**: `018-heartbeat-status-spinner` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-heartbeat-status-spinner/spec.md`

## Summary

Replace text-based heartbeat output with a structured session-status lifecycle and
an independently configurable web spinner. The shared spawn helper will detect
output inactivity and emit status transitions; adapters will normalize provider
tool-call lifecycle records; the event bus, SQLite persistence, and WebSocket
transport will carry those records; and the web run detail page will render the
status indicator plus collapsible, step-scoped tool-call groups. Existing
`RunStatus` values remain available for compatibility with statistics and
pipeline behavior, while the new session status is the canonical web lifecycle.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js >=20.17, React 18.3

**Primary Dependencies**: Node `child_process`, EventEmitter-backed typed event bus,
SQLite via `better-sqlite3`, Zod config schemas, `ws`, React, Vitest, and the
existing Codex/Claude/OpenCode adapter protocols.

**Storage**: Existing SQLite `runs` and run-output persistence, extended with
session-status fields and a normalized `run_tool_calls` table plus migrations.

**Testing**: Vitest unit/integration tests, React server-render tests where
appropriate, `npm run build`, `npm test`, `npm run typecheck`, and `npm run lint`.

**Target Platform**: Node.js CLI/runtime with the authenticated WebSocket web
dashboard. The legacy Ink TUI is explicitly not a target for new presentation.

**Project Type**: TypeScript CLI/orchestrator with a React web dashboard and
SQLite persistence.

**Performance Goals**: Detect idle within one configured status tick after the
threshold; keep status/tool-call payloads scoped by run; avoid sending repeated
heartbeat text or raw byte counters as the primary status; preserve live
transcript updates without unbounded client growth.

**Constraints**: Default idle threshold is 30 seconds and must be independently
overridable for tests and operators. Visual spinner enablement must not control
idle detection. Timeout must remain distinct from ordinary failure, and tool
arguments must follow existing visibility/redaction rules.

**Scale/Scope**: Multiple concurrent runs per web client, up to the existing
bounded live-output history; changes span shared adapters/events/DB/config and
the web run-detail transcript, with focused regression coverage for all three
adapters and concurrent run isolation.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Source of truth: **PASS**. The active feature spec is the source of truth;
  this plan, its contracts, and validation guide remain under the same feature
  directory. Observable status behavior is explicitly tied to FR-001–FR-012.
- Layer ownership: **PASS**. Spawn owns timing and process lifecycle; adapters
  normalize provider records; core events own contracts and delivery; DB owns
  migrations/queries; web owns presentation and collapse state.
- Validation: **PASS**. The plan includes focused adapter/event/DB/WebSocket/UI
  tests and the repository build, test, typecheck, and lint baseline.
- Runtime evidence: **PASS**. Quickstart includes a local configured run and
  requires persisted status/tool-call data plus WebSocket/UI evidence.
- Harness safety: **PASS / NOT APPLICABLE**. This is product feature planning,
  not validation of the `msq` executor; no nested runner or live executor is
  required by the plan stage.
- UI scope: **PASS**. New presentation targets `src/web`; heartbeat-only TUI
  behavior is removed where present and not expanded.

## Project Structure

### Documentation (this feature)

```text
specs/018-heartbeat-status-spinner/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── websocket-session-status.md
```

### Source Code

```text
src/
├── config/index.ts                         # idle threshold and spinner config
├── core/adapters/
│   ├── spawn.ts                            # independent status detector
│   ├── types.ts                            # normalized status/tool-call types
│   ├── codex.ts                            # Codex event normalization
│   ├── claude.ts                           # Claude stream normalization
│   └── opencode.ts                         # OpenCode event normalization
├── core/events/
│   ├── types.ts                            # run:status and tool:call contracts
│   ├── persistence.ts                       # persistence subscriptions
│   └── bus.ts                               # typed delivery
├── db/
│   ├── index.ts                            # schema/migrations
│   └── repo.ts                             # session/tool-call queries
├── web/
│   ├── types.ts                            # WebSocket/state payload types
│   ├── state.ts                            # initial session state projection
│   ├── server.ts                           # event broadcast/history payloads
│   └── client/
│       ├── App.tsx                         # live status/tool-call state
│       ├── pages/RunDetailPage.tsx         # run status integration
│       └── components/transcript/          # status and grouped tool calls
└── ui/                                     # remove heartbeat-only presentation

tests/
├── adapters/spawn.test.ts
├── adapters/codex.test.ts
├── adapters/misc.test.ts
├── core/events-persistence.test.ts
├── db/index-migrate.test.ts
├── db/repo*.test.ts
├── web/server.test.ts
└── web/*status* / web/*transcript*
```

**Structure Decision**: Extend the current single TypeScript project along its
existing ownership boundaries. No new package or service is introduced; the
WebSocket contract is documented because it is an external interface consumed
by the dashboard.

## Phase 0: Research Summary

Research decisions are recorded in [research.md](./research.md). All technical
unknowns identified from this context have been resolved before design:

1. Use a `SessionStatus` lifecycle separate from legacy persisted `RunStatus`.
2. Use structured `run:status` and `tool:call` events over the existing typed
   event bus and WebSocket broadcast path.
3. Persist current session status and normalized tool calls for reconnect and
   history instead of asking the browser to parse output text.
4. Keep visual animation local to the web client and independently configurable
   from backend idle detection.

## Phase 1: Design Decisions

- `SessionStatus` values are `running`, `idle`, `interrupted`, `failed`,
  `timed_out`, and `completed`; the last four are terminal.
- The spawn helper owns timestamps, last-output tracking, idle threshold checks,
  abort detection, and timeout classification. A status tick is not a visual
  heartbeat and must continue when the spinner is disabled.
- Adapters emit normalized tool-call start/completion/failure records with a
  stable call id, sequence, step/stage association, and redacted arguments or
  output. Provider-specific JSON remains inside each adapter.
- `run:status` and `tool:call` carry both `runId` and `featureId`. The web server
  broadcasts them to authenticated clients and includes current/history records
  in the existing run subscription/detail path.
- SQLite stores the current session projection on `runs` and normalized calls in
  `run_tool_calls`. Legacy `runs.status` remains `done`, `failed`, `blocked`, or
  `aborted` where existing statistics/pipeline code expects it; the session
  projection distinguishes `completed`, `failed`, `timed_out`, and
  `interrupted` for web/F55/F58 consumers.
- The client groups consecutive calls by run plus step/stage, shows a count, and
  keeps collapsed state keyed by a stable group id. Live updates append to the
  existing group rather than resetting its local collapse state.

## Phase 1: Implementation Outline

1. Add config/schema defaults for `idleThresholdMs` (30,000) and the web-only
   `statusSpinner` boolean (enabled by default), including repo runtime override,
   merge behavior, sanitized WebSocket state, and config tests.
2. Add shared session-status and tool-call types. Refactor `runCli` so status
   detection is independent from visual rendering; emit running/idle transitions
   on output/ticks and terminal statuses for abort, timeout, non-zero exit, and
   success. Remove raw heartbeat text as the primary status payload.
3. Extend Codex, Claude, and OpenCode progress parsers to emit normalized
   `tool:call` records while retaining existing output/usage/stage behavior.
   Apply argument/output sanitization and stable ordering at the adapter boundary.
4. Extend the event bus and persistence wiring with `run:status` and `tool:call`.
   Add SQLite migration/query helpers, update run projections, and preserve
   compatibility for existing run statistics and stale-run repair.
5. Extend the WebSocket/state contract and server subscriptions so live status,
   tool-call, and history/detail payloads are scoped by run and feature. Ensure
   concurrent runs cannot overwrite one another.
6. Build the web status indicator with distinct labels/tokens, elapsed/idle
   durations, optional animation, and terminal reasons. Replace transcript
   parsing of tool lines with structured records and render collapsible,
   indented step groups whose local collapsed state survives later events.
7. Remove heartbeat-only presentation from `src/ui` without removing shared run
   lifecycle behavior. Update documentation references if any TUI heartbeat
   contract remains.
8. Add focused tests for thresholds, disabled animation, all terminal mappings,
   structured adapter records, migration/query behavior, WebSocket isolation,
   reconnect/history, and transcript collapse persistence; then run the full
   repository validation baseline.

## Complexity Tracking

No constitution violations require justification. The additional SQLite table is
justified by the requirement that structured tool-call data survive reconnects
and history views; storing only transient browser state would violate the
structured-record and concurrent-run requirements.

## Post-Design Constitution Check

- Source of truth: **PASS** — artifacts are under the active feature directory
  and cite the source requirements.
- Layer ownership: **PASS** — no filesystem/process access is introduced in UI;
  adapter parsing and DB persistence remain behind their existing boundaries.
- Validation: **PASS** — every changed source area has focused tests plus the
  required build/test/typecheck/lint gates.
- Runtime evidence: **PASS** — quickstart requires both persisted records and a
  live WebSocket/UI observation.
- Harness safety: **PASS / NOT APPLICABLE** — no executor QA is performed here.
- UI scope: **PASS** — web-only status presentation, with TUI heartbeat-only
  behavior removed.

