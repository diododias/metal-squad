# Research: Remover step com limpeza

## Existing ownership

- `src/web/client/components/FeatureConfigDetail.tsx` owns stage selection and currently adds stages through `onSaveConfig`.
- `src/web/types.ts` intentionally exposes a narrow `FeatureConfigPatch` for `action:updateFeatureConfig`.
- `src/web/server.ts` delegates accepted patches to `updateCatalogFeature()`.
- `src/db/backlogCatalog.ts` deep-merges `workflow`, `approvals`, and `sessionPolicy`, validates with `FeatureSchema`, and commits the resulting feature in a SQLite transaction.
- `src/core/backlog/schema.ts` requires one or more stages and rejects guidance or isolated-stage references for missing stages.
- `src/core/runner/execute.ts` captures `feature.workflow` for a live staged execution, while `src/commands/resume.ts` currently reloads from the catalog.

## Decisions

### Atomic composed removal

**Decision**: Remove one stage by sending `stages`, `stepGuidance`, and `sessionPolicy.alwaysIsolatedStages` in one workflow patch.

**Rationale**: The catalog transaction validates the merged feature, so valid cleanup persists together and invalid data leaves the saved revision unchanged.

**Alternatives considered**: Sequential patch calls would create an invalid-reference window; weakening validation would accept corrupt workflows.

### Extend only the narrow wire contract

**Decision**: Add partial `sessionPolicy` support to `FeatureConfigPatch.workflow`.

**Rationale**: The internal catalog patch already supports it, but the browser contract cannot currently send it.

**Alternatives considered**: A broad `Partial<Feature>` would weaken the client boundary; a bespoke endpoint would duplicate catalog ownership.

### Persist the active workflow revision

**Decision**: Store a feature-id-to-structural-workflow JSON snapshot on each pipeline and reapply it when resuming.

**Rationale**: In-memory staged execution is already stable, but catalog reload on resume otherwise makes a paused execution adopt a later edit.

**Alternatives considered**: In-memory-only protection fails after process restart; an entire-backlog snapshot stores unrelated mutable data.

### One-stage guard and selection recovery

**Decision**: Disable the final stage's close control and select a deterministic remaining neighbor after removal.

**Rationale**: The UI communicates the invariant without a failed save and never leaves guidance drafts attached to a deleted stage.

**Alternatives considered**: Hiding the control makes the blocked state unclear; retaining deleted selection risks a stale edit.
