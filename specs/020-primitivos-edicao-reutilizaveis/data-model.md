# Data Model: Primitivos de edicao reutilizaveis

This feature has no persisted entities. Its model is an in-memory, controlled
component contract.

## Shared field state

| Field | Type | Owner | Rules |
|---|---|---|---|
| `label` | `string` | consuming card | Required; associated with the native control through a stable id. |
| `value` | typed current value | consuming card | Rendered value; the only value a user interaction may propose changing. |
| `initialValue` | typed reference value | consuming card | Saved/reference value used solely for comparison. |
| `disabled` | `boolean` | consuming card | Defaults to false; blocks native interaction but does not hide a dirty state. |
| `isDirty` | derived `boolean` | primitive | `true` exactly when current and initial values differ; never stored. |
| `onChange` | typed callback | consuming card | Receives the proposed new value; it does not persist it. |

## Text field

| Field | Type | Validation / display rule |
|---|---|---|
| `value`, `initialValue` | `string \| undefined` | Empty string and `undefined` remain distinguishable for dirty comparison. Render a stable missing-value hint for `undefined`; accept empty text normally. |
| `placeholder` | `string \| undefined` | Optional consumer-provided instructional text; must not replace the accessible label. |

## Select field

| Field | Type | Validation / display rule |
|---|---|---|
| `options` | readonly option list | Each option has a stable `value` and user-facing `label`; values are unique. |
| `value`, `initialValue` | `string \| undefined` | A missing value renders an explicit no-value choice/hint. If a received value is no longer in `options`, render it as an unavailable selected option until the parent changes it. |

## Toggle field

| Field | Type | Validation / display rule |
|---|---|---|
| `value`, `initialValue` | `boolean \| undefined` | `true` and `false` are real values. `undefined` renders a non-ambiguous not-configured state rather than coercing to false. |

## State transitions

```text
parent value equals initial ── user proposes new typed value ──> parent updates value
         ▲                                                        │
         └──────── parent restores initial value <────────────────┘

isDirty = !same(current, initial) at every render
disabled = true: no user transition; externally supplied dirty state remains visible
```

No transition writes a file, calls a WebSocket, changes `FeatureConfigPatch`, or
accesses the database.
