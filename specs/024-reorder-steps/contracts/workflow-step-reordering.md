# Workflow Step Reordering Contract

## Client configuration action

The feature editor uses the existing `action:updateFeatureConfig` WebSocket
action. It creates no new endpoint or message type.

```ts
type WorkflowReorderPatch = {
  workflow: {
    stages: string[];
  };
};
```

### Required semantics

- `stages` is the complete proposed sequence, not a positional delta.
- The array contains each existing stage exactly once and remains nonempty.
- The reorder patch must not include `stepGuidance` or `sessionPolicy`; their
  name-keyed saved values are preserved by the catalog merge.
- Boundary controls and an unchanged draft emit no patch.
- A save is considered accepted only after the existing acknowledgement and
  refreshed feature state confirm the saved sequence.

## Acknowledgement and failure

The server continues to acknowledge the action with
`featureConfig:saveResult`:

```ts
{ type: 'featureConfig:saveResult', payload: { featureId, ok: true } }
```

When validation or persistence fails, `ok` is `false` and `issues` identifies
the problem. The client retains the local proposed order, displays the feedback,
and does not treat it as the new saved baseline.

## Persistence and execution scope

`updateCatalogFeature()` merges the patch into the existing workflow, validates
the complete feature, and writes the catalog transaction atomically. The
pipeline workflow snapshot is an internal repository contract: it retains the
order used at pipeline creation, so this catalog action affects only pipelines
created after a successful save.
