# Data Model: Card de workflow editável

## Persisted aggregate: Feature.workflow

The existing `Feature` aggregate remains the only persisted entity. Its
workflow portion is stored within the feature's catalog `data_json` and is
validated as part of `FeatureSchema`.

| Field | Type / valid values | Ownership | Rule |
|---|---|---|---|
| `workflow.mode` | `'single' \| 'staged'` | Workflow schema | Both supported modes are selectable. Changing it never edits `stages`. |
| `workflow.stages` | non-empty `string[]` | Existing workflow config | Read-only for this feature; preserved by sparse patch merge. |
| `workflow.syncTasksToBacklog` | `boolean` | Workflow schema | Editable independently. |
| `workflow.approvals.channel` | current enum: `'telegram'` | Workflow approval schema | Displayed as approval destination; unavailable old values remain visible but cannot be submitted in a modified draft. |
| `workflow.approvals.autoAdvance` | `boolean` | Workflow approval schema | Editable independently and visibly marked legacy. |
| `workflow.sessionPolicy` | existing nested object | Existing workflow config | Not editable here; preserved by merge and validated against stages. |
| `workflow.stepGuidance` | stage-keyed guidance | Existing workflow config | Not editable here; every key must name an existing stage. |

## Transient entity: WorkflowDraft

`WorkflowDraft` lives in `FeatureConfigDetail` and contains exactly the four
editable values. Its baseline is reconstructed from the latest `feature` prop.

| State | Entry condition | Result |
|---|---|---|
| Clean | draft equals latest feature values | no workflow save action is offered |
| Dirty valid | one or more editable values differ and all local checks pass | a sparse `FeatureConfigPatch` can be sent |
| Dirty invalid | an unavailable/invalid destination or invalid combination is present | draft stays visible, save is blocked or server issues are shown |
| Save accepted | typed save result is `ok` and state refresh contains persisted values | baseline is updated and dirty state clears |
| Save rejected | typed save result is not `ok` | no catalog mutation; draft and field guidance remain visible for correction |

## Patch and validation boundary

The WebSocket patch contains only changed values:

```ts
{
  workflow: {
    mode?: 'single' | 'staged';
    syncTasksToBacklog?: boolean;
    approvals?: {
      channel?: 'telegram';
      autoAdvance?: boolean;
    };
  };
}
```

`mergeFeaturePatch` overlays the sparse patch on the current feature, including
a separate nested merge for `approvals`. `updateCatalogFeature` parses the
current stored feature and the merged result with `FeatureSchema` before issuing
the `UPDATE`. Thus invalid data produces no state transition and the prior
`data_json` stays authoritative.

## Error model

The save-result contract represents an issue as a stable path plus a human
message. Examples:

| Path | User guidance |
|---|---|
| `workflow.mode` | Choose `single` or `staged`. |
| `workflow.approvals.channel` | Choose an available approval destination before saving. |
| `workflow.sessionPolicy.alwaysIsolatedStages[0]` | The referenced stage must exist in `workflow.stages`; correct the existing workflow configuration before saving. |
| general persistence error | The workflow was not saved; retry after resolving the reported catalog/database issue. |

The server converts schema failures into these issues without exposing stack
traces to the browser; detailed errors remain in server logs.
