# Research: Card de execução editável

## Decision: compose the existing SET-01 fields in `FeatureConfigDetail`

**Rationale**: `EditableSelectField`, `EditableTextField`, and
`EditableToggleField` already expose a saved-reference input and derive their
own dirty indication. The feature-detail component only needs to own the
execution draft, compare it to the saved feature, validate the aggregate draft,
and construct a minimal patch.

**Alternatives considered**:

- Rebuild field controls in the execution card — rejected because it would
  duplicate dirty labels, accessible labels, and unavailable-value handling.
- Change the controls to persist directly — rejected because their explicit
  ownership boundary leaves persistence with the consumer and they are reused by
  other configuration cards.

## Decision: use the existing partial WebSocket action unchanged

**Rationale**: `action:updateFeatureConfig` already accepts
`FeatureConfigPatch`, allowlists its defined fields, calls `updateCatalogFeature`,
refreshes state on success, and emits a user-visible notice on failure. The
catalog deep-merges the patch and validates the complete feature with Zod inside
its transaction.

**Alternatives considered**:

- Add a dedicated execution-settings endpoint or WebSocket action — rejected as
  duplicate transport/ownership for the same persisted resource.
- Send a complete feature object — rejected because it risks overwriting fields
  edited elsewhere and violates the partial-update requirement.

## Decision: validate at the card before dispatch and retain catalog validation

**Rationale**: the client can immediately explain an invalid token limit and
avoid a needless write. The saved tool is selected only from the currently
supported `claude`, `codex`, and `opencode` choices; if a legacy/unavailable saved
value is present, the field remains intelligible but blocks save until replaced.
The catalog remains the authoritative boundary: its schema rejects an invalid
tool, effort, or non-positive/non-integer `maxTokens`, and failed validation
cannot write a partial result.

**Alternatives considered**:

- Server validation only — rejected because feedback would occur only after an
  attempted save and does not meet the actionable inline-guidance requirement.
- Client validation only — rejected because direct WebSocket clients would then
  bypass the invariant.

## Decision: accept the refreshed full state as the new saved baseline

**Rationale**: successful server updates call reconciliation and broadcast a
fresh `state:full`. Synchronizing the draft to the changed feature reference
clears dirty flags without a reload; on a failed save the local draft remains so
the person can correct or retry it.

**Alternatives considered**:

- Optimistically mutate global state — rejected because the persisted catalog is
  authoritative and could reject the action.
- Clear the draft after every save attempt — rejected because it loses recoverable
  user input when persistence fails.
