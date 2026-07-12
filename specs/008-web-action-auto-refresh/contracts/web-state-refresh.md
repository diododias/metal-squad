# Contract: Web State Refresh

**Feature**: 008-web-action-auto-refresh  
**Scope**: Observable refresh behavior for the existing web UI transport and shared state

## Goal

After any supported web control action, every visible surface in the same session must converge on the latest authoritative server state without a full page reload.

## Supported Actions

The following existing client messages are in scope for automatic refresh:

- `action:startFeature`
- `action:pausePipeline`
- `action:resumePipeline`
- `action:abortPipeline`
- `action:requestFeatureAbort`
- `action:resolveGate`
- `action:forceResolveGate`
- `action:resolveStageRequest`

## Authoritative Refresh Contract

### 1. Shared Snapshot

- The server remains responsible for building the authoritative shared snapshot with `buildMsqWebState()`.
- Browser clients treat `state:full` as replace-the-world state for shared web data such as runs, gates, pending features, and stats.
- Clients must not require a manual page reload to see a successful, failed, or blocked result of a supported action.

### 2. Immediate Refresh for Same-Process Mutations

When a supported action mutates state inside the web server process, the server must attempt an immediate refresh and, if the authoritative snapshot changed, broadcast:

```json
{
  "type": "state:full",
  "payload": {
    "runs": [],
    "gates": [],
    "pendingFeatures": []
  }
}
```

This applies to mutations such as pause/resume/abort and blocker resolution.
The same reconciliation cycle must also refresh any subscribed `run:detail`, `run:history`, and `run:changes` payloads that became stale because of the mutation.

### 3. Bounded Reconciliation for Detached-Process Mutations

When a supported action delegates work to a detached runner process, the web server must still detect the resulting authoritative state change within the bounded reconciliation interval and broadcast the updated snapshot without a page reload.
The implemented server-side reconciliation loop runs on an approximately 1-second cadence and suppresses duplicate `state:full` payloads when the authoritative snapshot has not changed.

Minimum observable outcomes:

- A started feature leaves `pendingFeatures` once execution exists
- A new run appears in `runs`
- Blockers created or resolved by the detached pipeline eventually update `gates` and affected run statuses

### 4. No Duplicate Waiting/Execution Representation

For the same latest authoritative state:

- a feature/task must not remain visible as both pending/TODO and active execution
- blocked executions count as execution-owned, not waiting-to-start
- terminal failed/aborted states may become startable again only when the latest authoritative projection says so

### 5. Subscribed Detail Surfaces

If a client is subscribed to:

- `run:detail`
- `run:history`
- `run:changes`

then refresh logic must keep those payloads aligned with the same authoritative cycle that produced the latest `state:full`. A detail surface must not lag behind the overview indefinitely after a supported action.
When a subscribed payload itself does not change, the server may skip re-sending it even if the reconciliation loop ran.

## Failure Contract

- If an action fails or is rejected, the UI must not show the requested transition as if it succeeded.
- Failure feedback may arrive through existing notice/error mechanisms, but the shared snapshot must remain aligned with reality.

## Ordering Contract

- If multiple supported actions occur in sequence for the same entity, the visible UI must settle on the latest confirmed authoritative state.
- Earlier intermediate states may appear transiently, but they must not be the final rendered result once newer confirmed state is available.

## Non-Goals

- Full page reload as a synchronization mechanism
- New external pub/sub infrastructure
- Rewriting the browser app around a new client state architecture
