# WebSocket Contract: Feature workflow configuration

This is an extension of the authenticated `/ws` feature-configuration action.
It does not add an HTTP endpoint or expose SQLite to the client.

## Client action

```ts
{
  type: 'action:updateFeatureConfig';
  featureId: string;
  patch: {
    workflow?: {
      mode?: 'single' | 'staged';
      syncTasksToBacklog?: boolean;
      approvals?: {
        channel?: 'telegram';
        autoAdvance?: boolean;
      };
    };
  };
}
```

Rules:

- The Workflow card sends a patch only when at least one editable value differs
  from its saved baseline.
- It must not send `stages`, `stepGuidance`, or `sessionPolicy` for this feature.
- The server merges the patch with the persisted feature, validates the whole
  aggregate, and writes atomically.

## Server result

The server sends this message only to the socket that initiated the action:

```ts
type FeatureConfigSaveIssue = {
  path?: string;
  message: string;
};

type FeatureConfigSaveResult = {
  type: 'featureConfig:saveResult';
  payload: {
    featureId: string;
    ok: boolean;
    issues?: FeatureConfigSaveIssue[];
  };
};
```

### Accepted save

```json
{
  "type": "featureConfig:saveResult",
  "payload": { "featureId": "feat-22", "ok": true }
}
```

The server reconciles and broadcasts the normal `state:full` after the
catalog transaction commits. The client clears the Workflow card's dirty state
only after that refreshed feature supplies the new baseline.

### Rejected save

```json
{
  "type": "featureConfig:saveResult",
  "payload": {
    "featureId": "feat-22",
    "ok": false,
    "issues": [
      {
        "path": "workflow.approvals.channel",
        "message": "Choose an available approval destination before saving."
      }
    ]
  }
}
```

The server must not reconcile state as a successful save or alter catalog data.
The client preserves the draft and renders the issue on the Workflow card. The
existing `ui:notice` is also emitted for dashboard-wide observability.

## Compatibility

- Existing execution and step-guidance patches remain valid.
- Existing WebSocket consumers that do not handle `featureConfig:saveResult`
  safely ignore it; the `state:full` protocol is unchanged.
- The result is a narrow acknowledgement, not a `Partial<Feature>` response;
  clients cannot use it to obtain or mutate hidden feature fields.
