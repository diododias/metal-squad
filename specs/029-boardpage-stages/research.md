# Research: Board cards display feature stages

## Decision: derive stages from the existing web-state catalog at render time

`BoardPage` will use `state.featureCatalog[featureId]?.workflow.stages` for
each card it constructs.

**Rationale**: `buildMsqWebState()` already exposes the catalog through
`MsqWebState`, and `FeatureCatalogEntry.workflow` is the resolved feature
workflow. This avoids a second catalog query, keeps the page inside the UI
layer, and lets two cards in the same status column carry different workflows.

**Alternatives considered**:

- A global `WORKFLOW_STAGES` fallback: rejected because SET-07 removes the
  global workflow view and heterogeneous features must not receive a misleading
  shared sequence.
- Add stages to `RunSummary` or persist a new DB field: rejected because stages
  are feature configuration, not run state; the catalog projection already has
  the authoritative value.
- Resolve catalog data in `KanbanCard`: rejected because the reusable component
  should remain presentation-only and cannot depend on page state or storage.

## Decision: make the card input optional for missing catalog entries

The page will omit `stages` when a feature lookup fails. It will pass an empty
array unchanged when a feature explicitly has no stages.

**Rationale**: this matches the feature requirements: an absent catalog entry
cannot break the board, while an explicitly empty workflow must not acquire an
invented default.

**Alternatives considered**:

- Suppress cards with no catalog record: rejected because runs remain useful
  operational evidence.
- Substitute the default workflow: rejected because it misrepresents the
  feature's configured state.

## Decision: require SET-08 before implementing SET-09

The contract requires `KanbanCardRun.stages?: string[]` and compact workflow
rendering. The current checkout's `KanbanCard` has neither, despite SET-08 being
documented as a prerequisite.

**Rationale**: SET-09 must only supply the feature-specific data. Rebuilding the
display contract here would merge two independently specified features and
obscure their validation boundary.

**Alternatives considered**:

- Implement the card display inside SET-09: rejected as scope expansion and
  duplication of SET-08.
- Block plan generation: rejected because the dependency is known and the
  implementation order resolves it without an unanswered product question.
