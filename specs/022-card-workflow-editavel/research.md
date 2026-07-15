# Research: Card de workflow editável

## Decision: reuse the sparse catalog patch path

**Decision**: Send only changed workflow fields through the existing
`action:updateFeatureConfig` WebSocket action, translate them to `FeaturePatch`,
and call `updateCatalogFeature`.

**Rationale**: `mergeFeaturePatch` already performs a deep merge of
`workflow.approvals` and `workflow.sessionPolicy`; `updateCatalogFeature` then
parses the whole merged Feature in one SQLite transaction. A patch such as
`{ workflow: { approvals: { autoAdvance: true } } }` therefore preserves stages,
channel, step guidance, session policy, and unrelated feature fields.

**Alternatives considered**:

- Replace the entire workflow object: rejected because it could erase stages or
  sibling settings from an older client draft.
- Add a separate workflow table: rejected because the catalog already persists
  the feature aggregate and has the required atomic validation path.
- Write `backlog.yaml` from the browser: rejected because UI code must not use
  filesystem access and the current editable configuration behavior is catalog
  based.

## Decision: use the established editable controls and a local workflow draft

**Decision**: Model `mode`, `syncTasksToBacklog`, `approvals.channel`, and
`approvals.autoAdvance` in a component-local `WorkflowDraft`; render mode and
channel with `EditableSelectField`, and booleans with `EditableToggleField`.

**Rationale**: these controls already expose labels, modified-state indicators,
unavailable saved options, and refreshed baseline behavior. A local aggregate
draft permits a single sparse save and preserves user edits after failed
validation.

**Alternatives considered**:

- Save immediately after every field change: rejected because it makes
  cross-field validation, correction, and no-op handling unreliable.
- Reuse read-only `ConfigField`: rejected because it cannot provide editing,
  dirty state, or accessible inputs.
- Add a new generic form system: rejected because the four fields match the
  existing small editable-control API.

## Decision: validate twice at the correct boundaries

**Decision**: validate enum choices and dirty/no-op conditions in the card;
authoritatively validate the complete merged Feature with `FeatureSchema` inside
the catalog transaction.

**Rationale**: fast local validation tells the user what to correct without a
round trip. Server-side schema validation protects the WebSocket boundary and
catches invariants involving existing stages, step guidance, and session policy.
Because parsing happens before `UPDATE`, a rejected configuration leaves the
persisted row unchanged.

**Alternatives considered**:

- Client-only validation: rejected because WebSocket clients are untrusted and
  current persisted data can violate cross-field invariants.
- Server-only validation: rejected because it delays simple actionable feedback
  and does not meet the established editable-card interaction.
- Validate individual fields only in the database: rejected because workflow
  correctness depends on the merged feature aggregate.

## Decision: make persistence outcomes addressable by the card

**Decision**: add a typed `featureConfig:saveResult` WebSocket server message
with `featureId`, `ok`, and either an accepted message or actionable issues;
the server sends it to the initiating socket after processing
`action:updateFeatureConfig`.

**Rationale**: the current `ui:notice` event is a dashboard-wide notification
and the App does not route it to `FeatureConfigDetail`. A typed result allows
the Workflow card to retain a failed draft and show the failing field/message,
while existing notifications remain useful operational evidence.

**Alternatives considered**:

- Depend only on `ui:notice`: rejected because it does not satisfy the
  requirement for guidance in the card.
- Optimistically replace the feature state before persistence: rejected because
  failed validation would falsely display an unsaved workflow.
- Use an HTTP endpoint: rejected because configuration actions already use the
  authenticated WebSocket transport.

## Decision: approval destination is the existing channel enum

**Decision**: label `approvals.channel` as the approval destination and offer
the values accepted by `WorkflowApprovalChannelSchema`; currently this is only
`telegram`. Preserve an unavailable stored value visibly and block a modified
save until the user chooses a valid option.

**Rationale**: the product currently models the destination as a channel enum,
not as an administrable list. This fulfills editing and validation without
inventing SET-40's destination-management scope.

**Alternatives considered**:

- Build a destination management UI: rejected as explicitly out of scope.
- Treat an unavailable value as `telegram` silently: rejected because it loses
  information and can overwrite configuration without user intent.

## Resolved technical context

All technical-context questions are resolved from the repository: TypeScript
5.7/Node >=20.17, React 18, Zod schema validation, `ws` transport, SQLite
catalog persistence, and Vitest/happy-dom tests. No external service or new
dependency is required.
