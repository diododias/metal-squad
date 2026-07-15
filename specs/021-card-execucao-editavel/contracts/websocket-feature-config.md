# WebSocket Contract: Update feature execution configuration

## Direction

Browser client to the existing `msq web` WebSocket server.

## Action

```json
{
  "type": "action:updateFeatureConfig",
  "featureId": "SET-02",
  "patch": {
    "effort": "high",
    "maxTokens": 5000
  }
}
```

`patch` uses the existing `FeatureConfigPatch` shape. For this card, it may
include only `tool`, `model`, `effort`, `maxTokens`, and `autoStart`; omitted
fields are intentionally unchanged.

## Field validation

| Field | Contract rule |
|---|---|
| `tool` | One of `claude`, `codex`, `opencode`. |
| `model` | Optional string. |
| `effort` | One of `low`, `medium`, `high`. |
| `maxTokens` | Positive integer when supplied. |
| `autoStart` | Boolean. |

The card blocks invalid drafts before sending. The catalog revalidates the
merged feature with the same authoritative schema, so invalid direct WebSocket
messages cannot persist a partial configuration.

## Outcomes

- **Success**: the server writes the merged feature, reconciles web state,
  broadcasts `state:full`, and emits a `ui:info` save message. The client adopts
  the refreshed values as its baseline.
- **Failure**: the server emits `ui:notice`; it does not reconcile state. The
  client retains the pending draft for correction or retry.
- **No changes**: the card sends no action; no persistence occurs.
