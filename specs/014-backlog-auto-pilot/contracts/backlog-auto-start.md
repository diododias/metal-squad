# Contract: Backlog Auto-Start Configuration

## Purpose

Define how a feature opts into automatic continuation across backlog execution surfaces.

## Backlog schema change

`Feature` gains a new boolean property:

```yaml
epics:
  - id: e17-modo-automatico
    title: E - Modo Automatico
    features:
      - id: feat-61
        title: F45 - Piloto Automatico
        autoStart: true
```

Rules:

- Omitted `autoStart` means `false`.
- `autoStart: false` features remain manually startable.
- `autoStart: true` does not bypass `dependsOn`, `retry`, `workflow`, or budget controls.

## Catalog/runtime contract

Any runtime surface that consumes parsed feature config must expose the resolved flag:

```ts
interface FeatureLike {
  id: string;
  title: string;
  dependsOn: string[];
  autoStart: boolean;
}
```

Affected consumers:

- `src/core/backlog/schema.ts`
- `src/db/backlogCatalog.ts`
- `src/ui/catalog.ts`
- `src/web/state.ts`

## WebSocket patch contract

`action:updateFeatureConfig` must accept the new field:

```ts
interface FeatureConfigPatch {
  autoStart?: boolean;
}
```

Expected behavior:

- Saving `autoStart: true` from the web UI updates the catalog-backed feature config.
- A live auto-pilot decision reads the latest catalog state before choosing the next candidate.
- Manual `action:startFeature` remains unchanged and valid for both `autoStart: true` and `autoStart: false`.

## Validation notes

- Schema parsing must default the field safely for older backlog entries.
- Catalog round-trips must preserve the boolean exactly.
- UI forms must not silently drop the field when saving unrelated feature config changes.
