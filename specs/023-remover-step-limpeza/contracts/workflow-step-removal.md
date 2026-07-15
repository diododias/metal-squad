# Workflow Step Removal Contract

## Client component to configuration action

The web component emits one existing `action:updateFeatureConfig` patch for a successful removal. It does not create a separate endpoint or action.

```ts
type WorkflowRemovalPatch = {
  workflow: {
    stages: string[];
    stepGuidance: Record<string, { skills?: string[]; prompt?: string }>;
    sessionPolicy: {
      alwaysIsolatedStages: string[];
    };
  };
};
```

### Required semantics

- `stages` retains original order except for the selected removed stage.
- `stepGuidance` omits exactly the removed stage key and retains every other entry unchanged.
- `sessionPolicy.alwaysIsolatedStages` omits exactly the removed stage and retains every other entry unchanged; `sessionPolicy.mode` is preserved by the server's deep merge.
- The patch is valid only when its resulting `stages` list is non-empty and all guidance/isolation references point to a remaining stage.
- For one stage, the disabled close control emits no patch.

## Server acknowledgement

The existing `featureConfig:saveResult` remains the acknowledgement:

```ts
{ type: 'featureConfig:saveResult', payload: { featureId, ok: true } }
```

On validation or persistence failure, `ok` is `false` and `issues` contains field paths/messages. The client must retain the visible failure and wait for refreshed state before considering a successful removal saved.

## Pipeline snapshot persistence

Pipeline persistence stores a JSON object keyed by feature id whose values are the workflow revision used to start that pipeline. It is an internal SQLite/repository contract, not a browser-exposed field. Resume consumes the stored structural revision; a new pipeline snapshots the currently saved catalog workflow.
