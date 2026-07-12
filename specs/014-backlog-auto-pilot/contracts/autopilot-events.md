# Contract: Auto-Pilot Outcome and Decision Events

## Purpose

Make feature outcomes explicit enough for deterministic automatic continuation and observability.

## Event 1: `run:done`

Existing event remains the success trigger.

```ts
interface RunDoneEvent {
  runId: number;
  featureId: string;
  tool: Tool;
  result: RunResult;
}
```

Auto-pilot rule:

- If the triggering feature resolves to `autoStart: true`, evaluate the next eligible automatic candidate.

## Event 2: `run:blocked`

New event for blocked-but-not-completed outcomes.

```ts
interface RunBlockedEvent {
  runId: number;
  featureId: string;
  tool: Tool;
  reason: 'needs_input' | 'gate' | 'budget' | 'token';
  summary: string;
}
```

Auto-pilot rule:

- `needs_input` and `gate`: skip the blocked feature and evaluate the next eligible automatic candidate.
- `budget` and `token`: emit a protective stop decision and do not auto-start anything else.

## Event 3: `run:failed`

Refine the existing failure event so ordinary failures can be distinguished from user-initiated aborts.

```ts
interface RunFailedEvent {
  runId: number;
  featureId: string;
  tool: Tool;
  error: string;
  kind: 'execution' | 'aborted';
}
```

Auto-pilot rule:

- `kind = 'execution'`: skip the failed feature and evaluate the next eligible automatic candidate.
- `kind = 'aborted'`: do not auto-continue; recovery stays manual.

## Event 4: `autopilot:decision`

New observability event emitted after every qualifying evaluation.

```ts
interface AutoPilotDecisionEvent {
  triggerFeatureId: string;
  triggerRunId: number;
  triggerKind: 'success' | 'blocked-human' | 'failed-execution' | 'blocked-protective' | 'aborted-manual';
  action: 'start' | 'idle' | 'stop';
  selectedFeatureId?: string;
  reason: string;
}
```

Expected meanings:

- `start`: a new automatic feature was selected and dispatched
- `idle`: the triggering outcome qualified, but no automatic candidate was eligible
- `stop`: a protective condition blocked further automatic dispatch

## Ordering and dedupe guarantees

- Only one automatic candidate may be started for a single qualifying outcome.
- The selected candidate must follow the same dependency-respecting backlog order used by the existing scheduler.
- A feature already active or already counted as done must never be selected again by auto-pilot in the same scheduling context.
