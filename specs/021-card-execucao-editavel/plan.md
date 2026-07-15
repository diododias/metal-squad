# Implementation Plan: Card de execução editável

**Branch**: `021-card-execucao-editavel` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/021-card-execucao-editavel/spec.md`

## Summary

Make the web dashboard's **Execução** card editable with the reusable SET-01
fields. The component will maintain a draft and saved baseline for `tool`,
`model`, `effort`, `maxTokens`, and `autoStart`; it will send only the changed,
valid fields through the existing `action:updateFeatureConfig` WebSocket action.
The existing server/catalog path validates and deep-merges the patch, persists it
to SQLite, and broadcasts refreshed state for the UI to adopt as its baseline.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js >=20.17

**Primary Dependencies**: React 18.3 web client, `ws` WebSocket transport, Zod
schema validation, better-sqlite3 persistence

**Storage**: Existing SQLite catalog table `backlog_features.data_json`; no schema
or migration change

**Testing**: Vitest 3; React DOM component tests and WebSocket/server integration
tests

**Target Platform**: The official browser-based `msq web` dashboard

**Project Type**: TypeScript CLI with embedded web dashboard

**Performance Goals**: A successful save becomes visible in the same WebSocket
state refresh, without a browser reload; no polling or new request path

**Constraints**: Reuse SET-01 editable controls; retain an unavailable saved tool
as understandable display state but prohibit saving it until a valid tool is
selected; reject empty, non-numeric, non-integer, or non-positive `maxTokens`
before dispatch; emit no action when the computed patch is empty

**Scale/Scope**: One feature-detail execution card, five fields, one existing
WebSocket action, and focused component/server/catalog regression coverage

## Constitution Check

**Pre-design: PASS**

- **Source of truth**: `specs/021-card-execucao-editavel/spec.md` is the feature
  specification; `backlog.yaml` remains the executable catalog source, with no
  catalog-shape change required.
- **Layer ownership**: the web component owns drafts, dirty state, and client
  validation; the existing server owns WebSocket dispatch/reconciliation; the
  catalog owns Zod validation and SQLite persistence. No UI filesystem or process
  access is introduced.
- **Validation**: implementation must pass build, full tests, typecheck, and
  lint, with focused component, server, and catalog coverage for changed behavior.
- **Runtime evidence**: this is a normal product feature, not an `msq` executor
  validation; no nested runner is planned. A manual web scenario may supplement
  automated evidence but is not a harness gate.
- **Harness safety and UI scope**: only the web dashboard is changed; no TUI code
  or executor flow is expanded.

## Project Structure

### Documentation (this feature)

```text
specs/021-card-execucao-editavel/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── websocket-feature-config.md
```

### Source Code

```text
src/
├── core/backlog/schema.ts                         # Existing execution-value validation
├── db/backlogCatalog.ts                           # Existing merge and SQLite persistence
├── web/server.ts                                  # Existing WebSocket action and state refresh
├── web/types.ts                                   # Existing FeatureConfigPatch contract
└── web/client/components/
    ├── FeatureConfigDetail.tsx                    # Primary implementation target
    └── core/Editable{FieldShell,SelectField,
        TextField,ToggleField}.tsx                 # SET-01 reusable controls

tests/
├── web/editable-controls.test.tsx                 # Existing primitive behavior coverage
├── web/server.test.ts                             # WebSocket persistence/reconciliation coverage
└── db/backlogCatalog.test.ts                      # Merge and invalid-patch atomicity coverage
```

**Structure Decision**: Retain the existing single-project web/client, web/server,
and catalog layers. The feature is an integration of existing UI primitives with
the current partial-patch contract; it does not add a service, endpoint, or data
store.

## Phase 0: Research

See [research.md](./research.md). All technical decisions and integrations are
resolved; no `NEEDS CLARIFICATION` items remain.

## Phase 1: Design

- Define the client draft/baseline and validation behavior in
  [data-model.md](./data-model.md).
- Preserve the existing external action contract documented in
  [contracts/websocket-feature-config.md](./contracts/websocket-feature-config.md).
- Use [quickstart.md](./quickstart.md) as the end-to-end validation guide.

## Post-design Constitution Check

**PASS**

The design keeps draft state solely in the web component, sends a narrow partial
patch to the current server boundary, and relies on the catalog's authoritative
Zod validation and transactional persistence. It adds automated coverage at the
component and existing integration boundaries. No constitutional exception or
complexity justification is required.

## Complexity Tracking

No constitution violations or complexity exceptions.
