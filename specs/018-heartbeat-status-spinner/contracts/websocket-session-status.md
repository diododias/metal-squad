# WebSocket Contract: Session Status and Tool Calls

The existing authenticated WebSocket (`/ws`) adds two event messages. Both are
sent only to authenticated clients and are scoped by `runId`; clients must not
apply a message to another run's card.

## `run:status`

```json
{
  "type": "run:status",
  "payload": {
    "runId": 42,
    "featureId": "feat-53",
    "tool": "codex",
    "status": "idle",
    "startedAt": "2026-07-14T12:00:00.000Z",
    "updatedAt": "2026-07-14T12:00:30.000Z",
    "elapsedMs": 30000,
    "lastOutputAt": "2026-07-14T11:59:58.000Z",
    "idleMs": 32000,
    "reason": null,
    "terminal": false
  }
}
```

Rules:

- Emit at run start, each meaningful transition, and the terminal transition.
- `running` is emitted when new output resumes after `idle`.
- `timed_out` is distinct from `failed`; `interrupted` is distinct from both.
- A client may use `updatedAt`/`elapsedMs` to render a local clock, but must not
  infer the lifecycle from output bytes or transcript text.
- A terminal payload is immutable for that run.

## `tool:call`

```json
{
  "type": "tool:call",
  "payload": {
    "id": "call-7",
    "runId": 42,
    "featureId": "feat-53",
    "tool": "codex",
    "sequence": 7,
    "phase": "completed",
    "name": "shell",
    "arguments": {"command": "npm test"},
    "output": "passed",
    "step": "plan",
    "startedAt": "2026-07-14T12:00:04.000Z",
    "completedAt": "2026-07-14T12:00:08.000Z",
    "error": null
  }
}
```

Rules:

- `started` precedes `completed`/`failed` when the provider exposes both phases.
- A provider without a start phase emits a synthetic start immediately before its
  terminal record with the same stable id.
- `arguments`, `output`, and `error` are sanitized and bounded by the server;
  clients must treat them as display data, not executable commands.
- The browser groups records by run, step/stage, and stable group sequence; it
  must preserve a group's local collapsed state across later events.

## History/detail payloads

The existing `run:detail` response includes the current session status and the
persisted normalized tool calls for the subscribed run. A reconnecting client
must be able to reconstruct the transcript without replaying raw output parsing.
The existing `run:output` stream remains available for ordinary agent/system
lines, but heartbeat status and tool-call lifecycle must use the structured
messages above.

