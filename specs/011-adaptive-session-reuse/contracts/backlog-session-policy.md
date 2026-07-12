# Contract: Backlog Session Policy

## Purpose

Define the user-editable backlog contract for enabling adaptive session reuse per feature.

## Scope

- `backlog.yaml`
- `src/core/backlog/schema.ts`
- `src/core/backlog/load.ts`
- `src/ui/catalog.ts`
- `src/ui/components/FeatureConfigSection.tsx`

## YAML Contract

```yaml
epics:
  - id: e07-adaptive-session-control
    title: E07 — Adaptive Session Control
    features:
      - id: feat-39
        title: F41 — Reaproveitamento Adaptativo de Sessao entre Steps
        workflow:
          mode: staged
          stages:
            - specify
            - plan
            - tasks
            - implement
            - validate
          approvals:
            channel: telegram
            autoAdvance: false
          syncTasksToBacklog: true
          sessionPolicy:
            mode: adaptive
            alwaysIsolatedStages:
              - specify
              - plan
```

## Field Definitions

| Path | Type | Default | Rules |
|------|------|---------|-------|
| `workflow.sessionPolicy.mode` | `'isolated' \| 'adaptive'` | `isolated` | Explicitly controls whether session reuse is ever considered |
| `workflow.sessionPolicy.alwaysIsolatedStages` | `string[]` | `[]` | Each stage must exist in `workflow.stages`; duplicates not allowed |

## Behavioral Contract

1. `mode: isolated`
   - The runner MUST start a new session for every stage transition
   - `alwaysIsolatedStages` remains valid config data but does not change the already-isolated behavior

2. `mode: adaptive`
   - The runner MAY reuse the previous session only when the transition decision contract allows it
   - Any stage listed in `alwaysIsolatedStages` MUST still start in a new session

3. Catalog/UI resolution
   - After `msq backlog load`, the catalog MUST preserve resolved defaults so the UI can show a complete policy even when the field is omitted in YAML
   - Feature detail/config surfaces MUST show the effective `mode` and `alwaysIsolatedStages`

## Validation Failures

The schema should reject:

- unknown `mode` values
- non-array `alwaysIsolatedStages`
- empty-string stage ids
- stage ids not present in `workflow.stages`

## Compatibility Notes

- Omitted `sessionPolicy` must behave exactly like today's F27 baseline
- Existing features without this block must continue to load and run unchanged
