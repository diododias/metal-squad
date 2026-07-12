# Data Model: Backlog Auto-Pilot

## 1. Feature

Persistent entity already stored in backlog YAML and backlog catalog JSON.

| Field | Type | Source | Rules |
|---|---|---|---|
| `id` | string | existing | Unique feature identifier |
| `title` | string | existing | Human-readable label |
| `dependsOn` | string[] | existing | Every dependency must reference another feature in the same backlog |
| `workflow` | object | existing | Keeps stage-level behavior; unchanged by auto-pilot |
| `retry` | object | existing | `onFail` still controls per-feature retry semantics |
| `maxTokens` | number? | existing | Existing feature-level budget cap |
| `autoStart` | boolean | new | Defaults to `false`; only `true` makes the feature eligible for automatic continuation |

Validation rules:

- `autoStart` is opt-in and must default to `false`.
- `autoStart` does not override dependency rules.
- `autoStart` does not override existing manual start behavior.

## 2. Auto-Pilot Eligibility

Derived runtime view, not persisted as its own table.

| Field | Type | Derived from | Rules |
|---|---|---|---|
| `featureId` | string | `Feature.id` | Candidate feature |
| `autoStart` | boolean | live catalog feature | Must be `true` |
| `dependenciesSatisfied` | boolean | scheduler done set / backlog order | All dependencies must already count as done |
| `alreadyDone` | boolean | pipeline snapshot / completed run state | Must be `false` |
| `alreadyActive` | boolean | active snapshot / current runs | Must be `false` |
| `blockedByProtectiveStop` | boolean | budget/token outcome classification | Must be `false` |
| `manualOnly` | boolean | `!autoStart` | Manual-only items are excluded from automatic selection |

Eligibility rule:

- A feature is auto-pilot eligible only when `autoStart = true`, all dependencies are satisfied, it is not active, it is not already completed for the current scheduling context, and no protective stop is in force.

## 3. Outcome Classification

Derived runtime classification used by dispatch logic and event payloads.

| Kind | Trigger source | Auto-pilot effect |
|---|---|---|
| `success` | `run:done` | Start the next eligible automatic feature, if one exists |
| `blocked-human` | `run:blocked` with approval/input/gate reason | Leave current feature blocked and continue to the next eligible automatic feature |
| `failed-execution` | `run:failed` ordinary execution failure | Leave current feature failed and continue to the next eligible automatic feature |
| `blocked-protective` | `run:blocked` with budget/token reason | Stop auto-pilot and require manual intervention |
| `aborted-manual` | aborted run or operator cancel | Do not auto-continue unless explicitly retried/resumed by a human |

## 4. Auto-Pilot Decision

Derived event-level record describing what the scheduler decided next.

| Field | Type | Rules |
|---|---|---|
| `triggerFeatureId` | string | Feature whose outcome triggered evaluation |
| `triggerRunId` | number | Run that produced the qualifying outcome |
| `triggerKind` | enum | `success`, `blocked-human`, `failed-execution`, `blocked-protective`, `aborted-manual` |
| `action` | enum | `start`, `idle`, `stop` |
| `selectedFeatureId` | string? | Present only when `action = start` |
| `reason` | string | Human-readable explanation for observability and tests |

State transitions:

1. `Pending` -> `Running`
2. `Running` -> `Done` -> auto-pilot evaluates next automatic candidate
3. `Running` -> `Blocked-human` -> feature stays blocked; auto-pilot evaluates next automatic candidate
4. `Running` -> `Failed-execution` -> feature stays failed; auto-pilot evaluates next automatic candidate
5. `Running` -> `Blocked-protective` -> pipeline pauses; auto-pilot stops
6. `Running` -> `Aborted-manual` -> feature waits for manual recovery; no automatic continuation

## 5. Persistence Impact

- No new SQLite table is required for the `autoStart` flag because backlog features are already persisted as JSON in `backlog_features.data_json`.
- Existing pipeline snapshot buckets (`done`, `pending`, `active`, `aborted`) remain the primary persistence mechanism for current execution state.
- Event and observability payloads need type updates so blocked vs failed outcomes are explicit and testable.
