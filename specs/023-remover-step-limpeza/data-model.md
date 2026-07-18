# Data Model: Remover step com limpeza

## Editable workflow revision

| Entity | Fields relevant to this feature | Rules and relationships |
|---|---|---|
| `Workflow` | `stages: string[]`, `stepGuidance: Record<string, StepGuidance>`, `sessionPolicy.mode`, `sessionPolicy.alwaysIsolatedStages` | `stages` has at least one value. Every `stepGuidance` key and isolated stage must exist in `stages`. |
| `StepGuidance` | `skills?: string[]`, `prompt?: string` | Belongs to one stage by its record key; it is deleted with that stage. |
| Isolation setting | `alwaysIsolatedStages: string[]` | Each value belongs to one stage; the removed stage is filtered out while other values and `mode` remain unchanged. |
| Catalog feature revision | `backlog_features.data_json` | The complete merged feature is Zod-validated then updated atomically in SQLite. |
| Pipeline workflow snapshot | `pipelines.workflow_snapshot_json` (feature id -> structural workflow) | Captured at pipeline creation; used for active/resumed execution so later catalog edits only apply to future pipelines. |

## State transitions

```text
Editable workflow with 2+ stages
  -> close selected stage
  -> one composed validated catalog patch
  -> refreshed saved workflow with stage/guidance/isolation removed

Editable workflow with 1 stage
  -> disabled close control
  -> unchanged draft and unchanged catalog

Pipeline created with workflow revision A
  -> catalog edited to revision B
  -> active or resumed pipeline continues with A
  -> newly created pipeline starts with B
```

## Validation matrix

| Operation | Required outcome |
|---|---|
| Remove a guided isolated stage | All three references are absent after one saved patch. |
| Remove an unconfigured stage | Remaining stages, guidance, isolation, mode, approvals, and sync settings are preserved. |
| Attempt final-stage removal | No request is dispatched; the only stage remains. |
| Submit stale/dangling patch | Schema validation rejects it and the catalog row is unchanged. |
| Resume after a catalog edit | Structural workflow comes from the persisted pipeline snapshot; current `autoAdvance` retains its documented live behavior. |
