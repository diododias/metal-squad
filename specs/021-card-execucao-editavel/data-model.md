# Data Model: Card de execução editável

## Persisted entity: Feature execution configuration

The persisted feature remains the existing catalog feature stored in
`backlog_features.data_json`. This feature introduces no table, column, or
migration.

| Field | Type | Valid values | Persistence behavior |
|---|---|---|---|
| `tool` | string | `claude`, `codex`, `opencode` | Included only when changed; schema validates enum. |
| `model` | optional string | Any user-entered model name; blank handling follows existing optional field semantics | Included only when changed. |
| `effort` | string | `low`, `medium`, `high` | Included only when changed; schema validates enum. |
| `maxTokens` | optional positive integer | Integer greater than zero when provided | Invalid blank/non-numeric/non-integer/non-positive input blocks save. |
| `autoStart` | boolean | `true` or `false` | Included only when changed. |

## Client-only entity: Execution configuration draft

`FeatureConfigDetail` holds a draft copy of the five execution fields and a
saved baseline derived from the currently displayed feature.

| State | Meaning | Transition |
|---|---|---|
| Clean | Every draft value equals the saved baseline. | Editing any field moves only that field to dirty. |
| Dirty | One or more valid fields differ from the baseline. | Reverting a field clears only its dirty state. |
| Invalid | The current token value is malformed/non-positive, or the saved/selected tool is unavailable. | Save is blocked and the draft remains displayed with actionable guidance. |
| Saving | A non-empty, valid patch has been sent. | A refreshed feature state becomes the new baseline; a server notice leaves the draft recoverable. |

## Relationships and invariants

- A draft maps to exactly one selected feature and resets/synchronizes when the
  selected feature identity or persisted execution values change.
- `FeatureConfigPatch` is a sparse projection of the draft: it contains only
  fields whose normalized values differ from the saved baseline.
- The server passes the patch to the catalog. The catalog deep-merges it with the
  existing feature and validates the complete resulting feature before its SQLite
  transaction writes; unmodified feature fields stay intact.
- An empty patch performs no dispatch and therefore no catalog write.
