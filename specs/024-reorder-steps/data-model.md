# Data Model: Reorder Workflow Steps

## Entities and relationships

| Entity | Fields relevant to this feature | Rules and relationships |
|---|---|---|
| `Workflow` | `stages: string[]`, `stepGuidance`, `sessionPolicy` | `stages` is an ordered, nonempty list. A reorder is a permutation: every original name appears once. |
| Workflow sequence draft | `draftStages: string[]` in the web component | Local preview of the persisted order. It is dirty only when its order differs from saved `stages`. |
| `StepGuidance` | `Record<stageName, { skills?, prompt? }>` | Belongs to a stage by name, so reordering does not modify it. Every key must name a stage. |
| Execution-isolation setting | `sessionPolicy.alwaysIsolatedStages: string[]` | References stage names, not positions; order changes do not modify it. Every item must name a stage. |
| Catalog feature revision | `backlog_features.data_json` | Receives the fully merged and Zod-validated workflow, including the reordered `stages` array, in one SQLite transaction. |
| Pipeline workflow snapshot | `pipelines.workflow_snapshot_json` | Captures the structural workflow, including stage order, at pipeline creation and is reapplied on resume. |

## State transitions

```text
Saved workflow revision A: [specify, plan, implement]
  -> editor moves plan upward in local draft
  -> preview: [plan, specify, implement]
  -> save one stages-array patch
  -> catalog workflow revision B: [plan, specify, implement]

Pipeline created under revision A
  -> catalog saves revision B
  -> active/resumed pipeline uses snapshot A
  -> newly created pipeline captures and uses B
```

## Validation matrix

| Operation | Required outcome |
|---|---|
| Move a middle stage | Adjacent positions swap in the draft; all stage names remain once. |
| Move first up or last down | Disabled control dispatches no change. |
| Save a changed draft | One patch contains the full reordered `stages` array only. |
| Failed save | Persisted order stays unchanged; the local draft stays visible with feedback. |
| Reorder guided/isolated stages | Guidance and isolation records remain exactly attached to their names. |
| Start after save | New pipeline captures the saved order. |
| Resume active pipeline after save | Pipeline uses its captured order, not the newer catalog order. |
