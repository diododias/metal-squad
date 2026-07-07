# Research: F08 Session and Run Navigation

## Decision: Replace the flat `selectedRun` view with a stack-based navigation state

**Rationale**: The current TUI only switches between `overview` and `run`
detail while keeping one flat `selectedRun` index. F08 requires four
hierarchical levels with back-navigation that preserves the prior selection,
filter, and search scope. A navigation stack with per-level view state models
that requirement directly and keeps `esc` semantics predictable.

**Alternatives considered**:

- Extend the current `activeView` enum with more view names.
  Rejected because the selection state would still be scattered across top-level
  indices and would not preserve per-level context cleanly.
- Split each level into a separate command or separate Ink app.
  Rejected because the feature explicitly requires drill-down within one
  keyboard-driven TUI flow.

## Decision: Add dedicated navigation queries instead of reusing `listRunsForTui()`

**Rationale**: `listRunsForTui()` intentionally returns only the latest run per
`repo_id + feature_id` pair, which is correct for the current overview but
incorrect for feature history and run comparison. F08 needs repo summaries,
feature-level history, and run-detail retrieval without deduplication, so it
needs a separate read-model layer over `repos`, `runs`, `pipelines`,
`token_usage`, `run_output`, and `run_events`.

**Alternatives considered**:

- Add flags to `listRunsForTui()` for every mode.
  Rejected because the query already bakes in overview-specific deduplication
  and status shaping; adding feature-history behavior there would conflate two
  different read models.
- Read raw tables in UI components.
  Rejected because the UI should consume typed view models, not SQL-specific
  records.

## Decision: Enrich labels from `backlog.yaml`, but never require backlog metadata for history access

**Rationale**: The DB persists `repo_id`, `feature_id`, run status, tokens, and
timestamps, but feature titles, declared skills, model, and effort come from
the backlog catalog. Navigation should use backlog metadata when available for a
better overview and detail experience, yet historical run inspection must still
work if the backlog entry was removed or renamed after the run happened.

**Alternatives considered**:

- Persist feature title snapshots inside `runs`.
  Rejected for F08 because it expands persistence scope and is not required to
  unlock navigation.
- Require backlog presence for all navigation nodes.
  Rejected because old runs would become inaccessible after backlog churn.

## Decision: Model comparison as ephemeral UI state for exactly two run ids from one feature

**Rationale**: The spec limits comparison to exactly two runs from the same
feature and only asks for differences in result, duration, and token usage. An
ephemeral pair selection in the feature-history view fits that scope, avoids new
tables, and allows the compare view to derive diffs from existing run summaries
plus detail metadata.

**Alternatives considered**:

- Store comparison sessions in SQLite.
  Rejected because the feature does not require persistence of user comparison
  choices.
- Allow cross-feature comparison.
  Rejected because it violates FR-009 and would complicate list semantics and
  diff labeling.

## Decision: Keep filtering and search scoped to the current list level

**Rationale**: The spec asks for status filters, tool filters, and feature
search within the current navigation context. Applying filters at the current
level keeps the mental model simple: repo list filters shape repo summaries,
feature list filters shape features under one repo, and run list filters shape
history for one feature. The UI only needs to show active filter badges and a
clear way to reset them on the current screen.

**Alternatives considered**:

- Global filters shared across all levels.
  Rejected because it makes back-navigation harder to understand and can hide
  parent-level items unexpectedly.
- Full-text log search.
  Rejected because the spec limits search to feature id/title and history
  narrowing, not output indexing.
