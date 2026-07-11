# Implementation Plan: Web Action State Auto Refresh

**Branch**: `008-web-action-auto-refresh` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-web-action-auto-refresh/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Make the web UI converge on the latest execution state immediately after control actions without requiring a page reload. The design keeps `buildMsqWebState()` as the server-authoritative snapshot, adds explicit refresh triggers for same-process actions, and introduces lightweight server-side change detection so detached runner processes also drive `state:full` and subscription updates across dashboard, run detail, gates, and backlog-derived views.

## Technical Context

**Language/Version**: TypeScript 5.7.3, Node.js >=20.17.0

**Primary Dependencies**:
- `ws` 8.21.0 for WebSocket transport between web UI and server
- React 18.3.1 for the browser client rendered from `src/web/static/*.js`
- `better-sqlite3` 11.8.1 for authoritative run/gate/stage-request state
- `commander` 13.1.0 for CLI entrypoints that start the web server and detached runs
- Existing in-process `msqEventBus` for same-process notifications

**Storage**: SQLite runtime database plus backlog catalog reads through `buildMsqWebState()`; no new storage engine or migration expected

**Testing**: Vitest 3.0.2; primary coverage in `tests/web/server.test.ts`, with supporting repository logic tests in `tests/db/*` if shared selectors change

**Target Platform**: Local `msq web` server and browser clients on Node-supported desktop environments

**Project Type**: Single-package CLI application with embedded web server and static browser UI

**Performance Goals**:
- Supported actions must reflect on the initiating screen and any other open surface within 2 seconds after the action result is known
- Same-process actions should refresh on the next WebSocket round-trip, without waiting for a coarse poll interval
- Background reconciliation must avoid full-page reloads and avoid flooding unchanged `state:full` payloads

**Constraints**:
- No full page reload as part of the normal success path
- No new infrastructure dependency such as Redis, external pub/sub, or browser framework rewrite
- Detached `msq run --feature` child processes do not share the web server's in-process event bus, so cross-process state changes must be detected another way
- Shared views must stay authoritative to server state; local optimistic mutations alone are insufficient because the same entity appears in multiple surfaces

**Scale/Scope**:
- Touches the web server snapshot/broadcast path, web client state handling, and backlog-derived pending-feature projection
- Affects actions `startFeature`, `pausePipeline`, `resumePipeline`, `abortPipeline`, `requestFeatureAbort`, `resolveGate`, `forceResolveGate`, and `resolveStageRequest`
- Expected code changes concentrated in `src/web/server.ts`, `src/web/state.ts`, `src/web/static/app.js`, and `tests/web/server.test.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: PASS

The constitution file at `.specify/memory/constitution.md` is still an unfilled template with placeholder headings and no enforceable project principles. No constitutional violation is detectable before or after design in the current repo state.

## Project Structure

### Documentation (this feature)

```text
specs/008-web-action-auto-refresh/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── web-state-refresh.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── web/
│   ├── server.ts                 # WebSocket actions, snapshot reconciliation, subscription refresh
│   ├── state.ts                  # Server-side web snapshot assembly and pending-feature projection
│   ├── types.ts                  # Existing web message/state contracts consumed by the browser
│   └── static/
│       ├── app.js                # Browser state handling for state:full and derived selections
│       └── components/           # Existing views driven by shared web state
├── db/
│   └── repo.ts                   # Authoritative run/gate/stage-request selectors used by web state
└── core/
    └── events/                   # Existing same-process event bus used as a fast-path signal

tests/
└── web/
    └── server.test.ts            # WebSocket action + refresh behavior coverage
```

**Structure Decision**: Keep the feature inside the existing single-package TypeScript project. Concentrate synchronization behavior in the web server so all browser surfaces continue consuming the same `MsqWebState` snapshot instead of duplicating transition logic in individual components.

## Complexity Tracking

No constitutional violations to justify in the current repo state.

---

## Implementation Summary

### Phase 0: Research

Resolved the design questions that would otherwise block implementation:
- whether the browser should mutate local state optimistically or continue relying on server-built snapshots
- how to observe state changes produced by detached runner processes that do not share `msqEventBus`
- how to prevent stale TODO/backlog entries when a feature already has an active or blocked run
- how to keep subscribed detail/history/changes views aligned with the same authoritative refresh cycle
- what automated coverage is needed to protect against stale-state regressions and out-of-order updates

See [research.md](./research.md) for decisions and tradeoffs.

### Phase 1: Design

Produced the design artifacts needed for implementation:
- [data-model.md](./data-model.md) defines the refresh-relevant entities and derived view projections
- [contracts/web-state-refresh.md](./contracts/web-state-refresh.md) defines the observable WebSocket/UI refresh contract
- [quickstart.md](./quickstart.md) documents end-to-end validation scenarios for run controls, blockers, and shared-view synchronization

### Agent Context Update

The repo does not currently contain the Spec Kit agent-context extension (`.specify/extensions/agent-context/...`), so there is no agent-context script to execute or managed context block to refresh in this stage.

### Post-Design Constitution Check

**Status**: PASS

The constitution remains an empty template, so the design artifacts introduce no detectable constitutional conflict.

---

## Design Artifacts Generated

| Artifact | Path | Purpose |
|----------|------|---------|
| Plan | `specs/008-web-action-auto-refresh/plan.md` | Technical context, structure, research/design summary |
| Research | `specs/008-web-action-auto-refresh/research.md` | Design decisions and rationale |
| Data Model | `specs/008-web-action-auto-refresh/data-model.md` | Refresh-relevant entities and derived-state rules |
| Contract | `specs/008-web-action-auto-refresh/contracts/web-state-refresh.md` | WebSocket/shared-view refresh contract |
| Quickstart | `specs/008-web-action-auto-refresh/quickstart.md` | End-to-end validation scenarios |

---

**Plan Status**: Complete
**Branch**: `008-web-action-auto-refresh`
**Next Command**: `/speckit-tasks`
