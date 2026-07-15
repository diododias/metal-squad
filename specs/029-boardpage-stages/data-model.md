# Data Model: Board cards display feature stages

This feature changes a UI projection only; it creates no persistent entity,
table, migration, or server message.

## Existing entities and projection

| Entity | Owned by | Relevant fields | Relationship |
|---|---|---|---|
| Feature catalog entry | backlog/catalog projection | `id`, `workflow.stages: string[]` | One entry supplies workflow configuration for every board item with the same feature id. |
| Run summary | SQLite run projection | `featureId`, `status`, `stage` | A run card finds its feature entry by `featureId`; `stage` identifies the currently active step. |
| Pending feature | catalog-derived board projection | `id`, `workflow.stages` | A TODO card is itself a feature entry and supplies its own stage list. |
| Kanban card input | web client | `featureId`, optional `stages`, optional current `stage` | Presentation projection created by `BoardPage`; it must not query persistence. |

## Mapping rules

1. For a TODO feature `f`, pass `f.workflow.stages` as the card stages.
2. For a run `r`, pass `state.featureCatalog[r.featureId]?.workflow.stages`.
3. If the run's feature is missing from the catalog, omit `stages`; retain all
   existing identifying and status fields.
4. If stages is an empty array, preserve it as empty. No default sequence is
   inferred.

## State transitions

No lifecycle or persisted state transition changes. The existing run `stage`
continues to identify the current step for the card's display component.
