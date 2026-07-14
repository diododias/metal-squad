# Data Model: Heartbeat Status Spinner

## Session status

The canonical lifecycle projection for one adapter session/run.

| Field | Type | Rules |
|---|---|---|
| `runId` | integer | Required; references the existing run. |
| `featureId` | string | Required; identifies the catalog feature. |
| `tool` | `claude \| codex \| opencode` | Required; source adapter. |
| `status` | enum | `running`, `idle`, `interrupted`, `failed`, `timed_out`, `completed`. |
| `startedAt` | ISO timestamp | Required; stable for the run. |
| `updatedAt` | ISO timestamp | Required; last status transition/update. |
| `elapsedMs` | non-negative integer | Derived from start and current/terminal time. |
| `lastOutputAt` | ISO timestamp or null | Updated by stdout/stderr/provider output. |
| `idleMs` | non-negative integer or null | Present while idle; zero/null for non-idle states. |
| `reason` | string or null | Safe, bounded explanation for interruption/failure/timeout. |
| `terminal` | boolean | Derived; true for interrupted/failed/timed_out/completed. |

Transitions:

```text
running --(threshold crossed)--> idle
idle    --(new output)---------> running
running --(abort)--------------> interrupted
idle    --(abort)---------------> interrupted
running --(timeout)-------------> timed_out
idle    --(timeout)-------------> timed_out
running --(non-zero/error)------> failed
idle    --(non-zero/error)------> failed
running --(successful close)----> completed
idle    --(successful close)----> completed
```

The existing `runs.status` remains a compatibility projection: `completed` maps
to `done`, `interrupted` maps to `aborted`, and `timed_out` maps to `failed` until
all existing pipeline/statistics consumers can adopt the richer field.

## Status event

`run:status` is the event-bus and WebSocket representation of a status
transition. It contains the complete session status snapshot rather than a
message that consumers must infer from output counters.

Validation rules:

- `runId` and `featureId` are mandatory and must identify the same run.
- Terminal statuses do not transition back to `running`.
- `reason` is bounded and sanitized before persistence/transport.
- `elapsedMs` and `idleMs` are non-negative and computed by the shared spawn
  lifecycle rather than by UI byte counters.

## Tool call record

One normalized adapter tool invocation.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Stable provider call id, or generated run-scoped id. |
| `runId` | integer | Required. |
| `featureId` | string | Required. |
| `tool` | adapter enum | Required. |
| `sequence` | integer | Monotonic within a run. |
| `phase` | enum | `started`, `completed`, or `failed`. |
| `name` | string | Normalized provider/tool name. |
| `arguments` | JSON-safe value or null | Optional; follows existing redaction rules. |
| `output` | bounded string or null | Optional completion/failure detail. |
| `step` | string or null | Current stage/step association when known. |
| `startedAt` | ISO timestamp | Required for start and terminal updates. |
| `completedAt` | ISO timestamp or null | Set for completed/failed phases. |
| `error` | bounded string or null | Set only for failed calls. |

The persistence key is `(run_id, id)` so a completion event updates the start
record rather than creating an unrelated second call. Provider payloads are
normalized and sanitized before entering this model.

## Tool call group

A web presentation projection, not an independent server entity.

- Group key: `runId + step-or-stage + groupSequence`.
- Members: ordered tool-call records for the current step.
- Summary: `N tool calls` plus aggregate running/completed/failed state.
- Presentation state: local `collapsed` boolean, defaulting to collapsed after
  the first completed group and open while the current group is running.
- Incoming status/output/tool events update members without replacing the local
  collapse map.

## Configuration

| Key | Type | Default | Scope |
|---|---|---:|---|
| `idleThresholdMs` | positive integer | `30000` | Runtime and repo override; detector threshold. |
| `web.statusSpinner` | boolean | `true` | Web presentation only; does not affect detection/events. |

