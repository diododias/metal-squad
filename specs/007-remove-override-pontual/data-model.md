# Data Model: Remove OVERRIDE PONTUAL

**Feature**: 007-remove-override-pontual  
**Date**: 2026-07-11

## Summary

Esta feature nao introduz novas entidades, nao altera schema, e nao cria migrations. A remocao do Override Pontual elimina um caminho paralelo de customizacao (in-memory, temporario) que coexistia com a configuracao persistida. Apos a remocao, a **Feature Configuration** persistida no banco (F35/F36) e a unica fonte de customizacao de parametros.

## Entity: Feature Configuration (existente — sem alteracoes)

**Source**: `src/ui/catalog.ts` → `FeatureCatalogEntry`  
**Storage**: SQLite catalog (F35), persisted via `updateCatalogFeature` (F36)

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| tool | `ToolSchema` (claude/codex/opencode) | backlog.yaml → DB | Obrigatorio |
| model | `string?` | backlog.yaml → DB | Optional, defaults to tool's default model |
| effort | `EffortSchema` (low/medium/high) | backlog.yaml → DB | Obrigatorio |
| maxTokens | `number?` | backlog.yaml → DB | Per-feature budget override (F36) |
| skills | `string[]?` | backlog.yaml → DB | Optional skill list |
| workflow | `Workflow?` | backlog.yaml → DB | Staged/single mode config |
| retry | `Retry?` | backlog.yaml → DB | Retry policy |
| dependsOn | `string[]?` | backlog.yaml → DB | Feature dependencies |

### Validation Rules (existing)

- `tool`: must be one of `claude`, `codex`, `opencode` (enforced by `ToolSchema` zod)
- `effort`: must be one of `low`, `medium`, `high` (enforced by `EffortSchema` zod)
- `maxTokens`: must be positive integer when present
- All other fields: validated by their respective zod schemas in `src/core/backlog/schema.ts`

### State Transitions

N/A — configuration is declarative, not stateful.

## What Is Removed

| Removed Element | Type | Location | Replaced By |
|----------------|------|----------|-------------|
| `OverrideSection` component | React component | `FeaturePreview.js:366-413` | `FeatureConfigForm` (F36) |
| `overrides` state in `FeaturePreview` | React state | `FeaturePreview.js:516-529` | N/A (not needed) |
| `handleOverrideChange` handler | React handler | `FeaturePreview.js:539-542` | N/A |
| `cleanOverrides` logic | React logic | `FeaturePreview.js:549-553` | N/A |
| `.override-fields` CSS | CSS rules | `styles.css:623-644` | N/A |
| `overrides?` in `WebSocketClientMessage` | TypeScript type | `types.ts:105` | N/A |
| `overrides` param in `startFeature()` | TypeScript param | `server.ts:612` | N/A |
| `overrideArgs` construction | TypeScript logic | `server.ts:635-638` | N/A |
| `--tool`, `--model`, `--effort` CLI flags | Commander options | `run.ts:17-19` | N/A |
| In-memory feature mutation | TypeScript logic | `run.ts:40-48` | N/A (DB config used directly) |
| `tokenEstimatesByTool` state | TypeScript state | `state.ts`, `types.ts` | N/A (only used by OverrideSection) |
| Override send logic | JavaScript | `app.js:694-698` | N/A |

## Data Flow (After Removal)

```
User edits params → FeatureConfigForm → "Save Config" → action:updateFeatureConfig
    → server.ts → updateCatalogFeature() → SQLite DB

User starts feature → "Start Feature" → action:startFeature (no overrides)
    → server.ts → startFeature(featureId, cwd)
    → spawn: msq run --feature <id>
    → run.ts → loadBacklogFromCatalog() → reads persisted config from DB
    → adapter executes with persisted tool/model/effort
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Feature never had config saved | Uses defaults from backlog.yaml (loaded into catalog) |
| DB inaccessible | Error message displayed, feature not started |
| Feature previously run with override pontual | Persisted config (if any) used; if none, defaults apply |
