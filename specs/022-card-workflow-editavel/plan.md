# Implementation Plan: Card de workflow editável

**Branch**: `022-card-workflow-editavel` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/022-card-workflow-editavel/spec.md`

## Summary

Make the Workflow card in the web feature-detail editable for `mode`,
`syncTasksToBacklog`, `approvals.channel`, and the legacy
`approvals.autoAdvance`. Reuse the editable field controls and sparse WebSocket
configuration patch path already used by the Execution card. Validate the draft
before dispatch and validate the merged feature again in the catalog transaction;
return a typed save result so the Workflow card keeps the draft and gives an
actionable error when persistence rejects a configuration.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js >=20.17

**Primary Dependencies**: React 18, Zod 3, `ws`, `better-sqlite3`, Vitest 3,
happy-dom

**Storage**: SQLite backlog catalog (`backlog_features.data_json`), accessed
only through `src/db/backlogCatalog.ts`; the persisted feature is validated by
`FeatureSchema` before its transaction commits.

**Testing**: Vitest; React/happy-dom component tests, WebSocket server tests,
and SQLite catalog tests

**Target Platform**: Browser client served by the Node.js `msq web` dashboard

**Project Type**: Node.js CLI with a React web dashboard

**Performance Goals**: Field edits and client-side validation are synchronous;
one valid save sends one small WebSocket message and the refreshed catalog state
is reflected in the same dashboard interaction.

**Constraints**: The web dashboard is the only UI target; the patch must be
narrow and preserve workflow stages, step guidance, session policy, and every
non-workflow feature property. `approvals.autoAdvance` remains editable but is
explicitly labelled legacy. No approval-destination administration is added.

**Scale/Scope**: One existing feature configuration detail component, its
WebSocket contract/handler, and focused tests. The only currently valid approval
channel is `telegram`.

## Constitution Check

### Pre-design gate

- **Source of truth — PASS**: the versioned feature spec is the delivery
  artifact. The runtime change updates the catalog through the existing
  `updateCatalogFeature` path and rehydrates observable web state after a
  successful save.
- **Layer ownership — PASS**: React owns draft controls and presentation;
  `src/web/types.ts` owns the wire shape; `src/web/server.ts` translates and
  reports requests; `src/db/backlogCatalog.ts` owns merging, validation, and
  SQLite writes. No UI code reads files or accesses SQLite.
- **Validation — PASS**: the plan adds focused component, server, and catalog
  tests; implementation must run build, test, typecheck, and lint because it
  changes TypeScript under `src/` and `tests/`.
- **Runtime evidence — NOT REQUIRED**: this is normal web-feature work, not an
  `msq` executor/harness validation. The quickstart contains an optional manual
  dashboard check; no nested runner is introduced.
- **Harness safety — PASS**: no `msq-develop`, nested `msq run`, or TUI work is
  part of the implementation.
- **UI scope — PASS**: all UI work is in `src/web/`; no `src/ui/` code changes.

## Project Structure

### Documentation (this feature)

```text
specs/022-card-workflow-editavel/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── feature-config-websocket.md
└── tasks.md                  # produced later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── core/backlog/schema.ts                         # workflow enum and full-feature validation
├── db/backlogCatalog.ts                            # deep sparse merge and SQLite transaction
└── web/
    ├── types.ts                                   # client/server WebSocket contract
    ├── server.ts                                  # action handling and save result
    └── client/
        ├── App.tsx                                # routes save result to the active feature detail
        ├── components/FeatureConfigDetail.tsx     # workflow draft, controls, feedback
        └── components/core/Editable*Field.tsx     # reused controls; change only if a shared need emerges

tests/
├── db/backlogCatalog.test.ts
└── web/
    ├── featureConfigDetail.test.tsx
    └── server.test.ts
```

**Structure Decision**: extend the existing web configuration path rather than
adding an endpoint, service, table, or UI subsystem. The catalog remains the
single persistence owner and the client communicates exclusively through its
existing WebSocket action.

## Design

Detailed decisions, data model, validation matrix, and WebSocket contract are
in [research.md](./research.md), [data-model.md](./data-model.md), and
[contracts/feature-config-websocket.md](./contracts/feature-config-websocket.md).

Implementation will:

1. Expand the narrow workflow portion of `FeatureConfigPatch` to permit the
   approval channel as well as auto-advance, without allowing client changes to
   `stages`, `stepGuidance`, or `sessionPolicy` through this card.
2. Add a `WorkflowDraft` in `FeatureConfigDetail`, derive a sparse patch from
   the saved feature, and render the four fields with the established editable
   select/toggle controls. The auto-advance label includes `legacy`.
3. Disable workflow saving for no-op or locally invalid drafts, preserve an
   unavailable saved channel visibly, and retain all draft values after a failed
   request. A valid request contains only fields changed from the saved baseline.
4. Have the server continue to delegate persistence to `updateCatalogFeature`.
   The catalog's existing deep merge plus `FeatureSchema.parse` validates the
   complete merged workflow atomically before an update; no failed request may
   change `data_json`.
5. Add a typed `featureConfig:saveResult` server message, correlated by feature
   id, for accepted and rejected feature-config actions. The App routes it to
   the active detail so the Workflow card displays success or an actionable
   validation message. Existing global `ui:info`/`ui:notice` notifications stay
   intact for cross-dashboard visibility.
6. Reset the workflow draft baseline only when refreshed feature state contains
   the accepted values; do not reset it on a rejected result. This makes a
   corrected retry possible and proves same-interaction visibility.

## Post-design Constitution Check

- **Source of truth — PASS**: the spec, contract, and quickstart document the
  observable update behavior; the catalog row is the persistence evidence.
- **Layer ownership — PASS**: validation is intentionally duplicated only at
  the boundary (fast client guidance plus authoritative server/catalog schema
  validation); business persistence remains in the database layer.
- **Validation — PASS**: test coverage is mapped to each boundary and the full
  TypeScript baseline is defined in the quickstart.
- **Runtime evidence — PASS / not applicable**: no executor run is claimed.
  The optional dashboard scenario validates persisted state and refreshed UI,
  two concrete signals for the web interaction.
- **Harness safety — PASS**: no harness workflow or nested runner appears in
  the design.
- **UI scope — PASS**: web dashboard only.

## Complexity Tracking

No constitution violations require justification.
