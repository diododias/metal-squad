# Research: Reorder Workflow Steps

## Existing ownership

- `src/web/client/components/FeatureConfigDetail.tsx` owns step controls,
  feature-config drafts, and save-result feedback.
- `src/web/types.ts` already permits `workflow.stages` in the narrow
  `FeatureConfigPatch`.
- `src/web/server.ts` forwards `action:updateFeatureConfig` to the catalog and
  returns `featureConfig:saveResult`.
- `src/db/backlogCatalog.ts` deep-merges a workflow patch, validates the
  complete feature with `FeatureSchema`, and commits one SQLite transaction.
- `src/core/backlog/schema.ts` requires one or more stages and ensures guidance
  and isolation references name a declared stage.
- `src/core/runner/execute.ts` captures a structural workflow revision for each
  pipeline and reapplies it for active/resumed execution.

## Decisions

### Accessible adjacent-move controls with a local preview

**Decision**: Use move-up and move-down buttons for each rendered stage and a
local `draftStages` array. Controls use accessible names such as `Move plan up`
and `Move plan down`; boundary controls are disabled.

**Rationale**: The existing editor represents stages as pills with buttons.
Adjacent controls work with keyboard and assistive technology, avoid drag/drop
complexity, and let the UI show the entire prospective order before persistence.

**Alternatives considered**:

- Drag-and-drop was rejected because it adds pointer/keyboard interaction
  complexity without improving the specified outcome.
- Immediate save per movement was rejected because it does not provide a clear
  multi-step preview before the editor chooses to save.

### One minimal reorder patch

**Decision**: Save exactly the proposed complete array as
`{ workflow: { stages: draftStages } }`.

**Rationale**: `FeatureConfigPatch` already accepts `stages`, and catalog merge
preserves absent workflow fields. The payload is explicit about the complete
sequence while avoiding unrelated edits.

**Alternatives considered**:

- A dedicated reorder endpoint was rejected because it would duplicate the
  established client/server/catalog boundary.
- Sending guidance or isolation alongside the order was rejected because those
  values are keyed by stage name and should remain untouched.

### Preserve configuration by stage identity

**Decision**: Do not transform `stepGuidance` or
`sessionPolicy.alwaysIsolatedStages` during reorder.

**Rationale**: Both reference stage names, not array indexes. The deep merge
retains their exact values while `FeatureSchema` continues to reject dangling
references.

**Alternatives considered**: Index-based remapping was rejected because it is
incorrect for name-keyed data and risks changing settings during a sequence-only
operation.

### Reuse catalog atomicity and pipeline snapshots

**Decision**: No server, database, schema, or runner code is required beyond
the component behavior and focused proof tests.

**Rationale**: `updateCatalogFeature()` validates the merged feature before its
single transaction writes the catalog. Pipelines already store a structural
workflow snapshot that includes the ordered stages, and resume reapplies it.
Thus a failed save leaves the catalog untouched, active runs retain revision A,
and a pipeline created after a valid save captures revision B.

**Alternatives considered**:

- New ordering columns or tables were rejected because the ordered array is
  already the canonical persisted representation.
- Mutating active runs was rejected because it violates the specification and
  the existing snapshot boundary.
