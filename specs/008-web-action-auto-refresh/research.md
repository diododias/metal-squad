# Research: Web Action State Auto Refresh

**Feature**: 008-web-action-auto-refresh  
**Date**: 2026-07-11

## Research Tasks

### 1. Source of truth for post-action UI state

**Decision**: Keep `buildMsqWebState()` as the single authoritative state source for the web UI, and refresh browser views by rebroadcasting server-built snapshots instead of applying per-component optimistic mutations.

**Rationale**: The same run, feature, and blocker can appear simultaneously in kanban columns, run detail, gates, and backlog-derived preview views. Updating only the initiating widget would duplicate transition logic across the client and still leave other surfaces stale. The server already knows how to assemble a coherent snapshot from SQLite and backlog catalog data.

**Alternatives considered**:
- Client-side optimistic patches per action: faster for one widget, but brittle across shared views and failure paths
- Local reducer-only approach in `app.js`: would duplicate selectors that already exist in `src/web/state.ts`

### 2. Cross-process refresh strategy

**Decision**: Use a hybrid refresh model:
- immediate `refreshState()` + `state:full` broadcast after same-process actions that directly mutate DB state
- short-interval server-side snapshot polling with change detection to catch detached runner updates that never hit the web server's `msqEventBus`

**Rationale**: `pausePipeline`, `resumePipeline`, gate resolution, and stage-request resolution all run in the web server process, so they can trigger an immediate refresh. `startFeature` spawns a detached `msq run --feature` child, and that child writes runs/events/output into SQLite without sharing the parent's in-memory event bus. A lightweight poll is therefore required to observe new runs, run completion, blocker creation, and other cross-process transitions. This mirrors the TUI pattern already used in hooks like `useRuns()` and `useGates()`, but keeps it on the server side so browser clients still receive push updates.

**Alternatives considered**:
- Event bus only: insufficient because detached child processes are invisible to the parent process's bus
- Full page reload after each action: violates the feature goal and degrades UX
- New external pub/sub layer: too heavy for the current local single-node architecture

### 3. Poll cadence and broadcast discipline

**Decision**: Reconcile frequently enough to satisfy the 2-second success criterion, but broadcast only when the authoritative state actually changes.

**Rationale**: The web server already polls `run_output` every second for detached-run output. Extending the same philosophy to full-state reconciliation is acceptable if it avoids sending duplicate `state:full` payloads on every tick. A change-detection step on the server avoids unnecessary rerenders and websocket noise while still providing bounded staleness for detached-run state.

**Alternatives considered**:
- Slow poll intervals (2s+): risk missing the UX target once network and render time are added
- Unconditional broadcasts every interval: simple, but noisy and wasteful

### 4. Pending feature projection after execution starts

**Decision**: Treat any feature with an active execution representation as ineligible for `pendingFeatures`, including blocked executions, not just `running` or `done`.

**Rationale**: The current projection in `src/web/state.ts` excludes only features whose latest summarized run is `running` or `done`. Because `blocked` runs are omitted from `activeFeatureIds`, a feature can remain visible in TODO/backlog while also appearing as blocked in execution-oriented views. That contradicts FR-004 and FR-007. The projection should follow execution reality, not only the "running" label.

**Alternatives considered**:
- Keep blocked features in pending views so users can restart them: inconsistent with the feature spec and duplicates the same work item across surfaces
- Remove every feature with any historical run: would hide failed or aborted items that legitimately need to reappear as startable work

### 5. Refresh scope for subscribed detail/history/changes views

**Decision**: Fold subscribed `run:detail`, `run:history`, and `run:changes` updates into the same reconciliation pipeline that detects authoritative state changes.

**Rationale**: `run:detail` is currently refreshed only from same-process `task:*`, `run:*`, and `tokens:update` events. That means detached-run progress or status changes can leave the detail view stale even if the overview eventually catches up. Aligning subscription refresh with the same poll/change-detection loop keeps detail surfaces coherent with the main snapshot and avoids having one view claim an older state than another.

**Alternatives considered**:
- Refresh only `state:full` and leave detail subscriptions event-driven: simpler, but still leaves stale derived views
- Add client-side manual resubscribe after every action: harder to reason about and still misses detached changes

### 6. Sequential action ordering

**Decision**: The server should always publish the latest confirmed snapshot after each refresh cycle and never synthesize an earlier intermediate client state as final truth.

**Rationale**: The spec explicitly calls out quick successive actions on the same run or blocker. The safest way to satisfy FR-009 is to keep the client mostly declarative: accept server pushes, replace the authoritative snapshot, and let the most recent confirmed DB state win.

**Alternatives considered**:
- Queue client-side optimistic transitions: raises rollback and ordering complexity
- Ignore intermediate states entirely: hides useful feedback and can make actions feel unresponsive

### 7. Validation strategy

**Decision**: Cover the feature primarily with `tests/web/server.test.ts`, including action-triggered refresh broadcasts, detached-change reconciliation behavior, and no-duplicate pending/execution states.

**Rationale**: The core regression is in the web server's synchronization contract, not in visual styling. Existing tests already validate action routing and `state:full` for config persistence. This feature needs the same style of websocket-level verification for run controls and blocker resolution.

**Alternatives considered**:
- Browser-only manual validation: necessary as a final check, but insufficient for preventing regressions
- Pure client tests in `src/web/static/*`: weaker because the authoritative bug sits server-side

## Summary of Findings

- The current stale-state bug comes from a gap between action side effects and snapshot rebroadcasts, not from missing UI components.
- Same-process mutations can be refreshed immediately; detached-run mutations require server-side polling or equivalent reconciliation.
- `pendingFeatures` currently under-classifies blocked work as still pending, which creates duplicate TODO/execution visibility.
- The most robust implementation path is server-authoritative refresh plus client replacement of shared state, not optimistic local reducers.
