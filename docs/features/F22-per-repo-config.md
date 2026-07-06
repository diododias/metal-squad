# F22 — Per-Repo Config Overrides

**Epic**: [E05 — Developer Experience](../epics/E05-dx-improvements.md)
**Prioridade**: Media
**Esforco**: Low

## Problema

Config eh apenas global (`~/.config/metal-squad/config.json`). Repos diferentes podem precisar de concurrency, budget, ou notifications diferentes.

## Solucao

### Arquivo `.msq/config.yaml` no repo

```yaml
concurrency: 5
budget:
  maxCostUsd: 20.00
notifications:
  channels:
    - type: slack
      webhookUrl: ${SLACK_WEBHOOK_URL}  # env var interpolation
defaults:
  tool: codex
  effort: high
```

### Merge logic

1. Global config (base)
2. Repo config (override)
3. Backlog-level defaults (override)
4. Feature-level (override)

### Env var interpolation

`${ENV_VAR}` sao resolvidos no load, permitindo valores sensiveis sem hardcoding.

## Criterios de aceite

- [ ] `.msq/config.yaml` detectado e aplicado
- [ ] Merge hierarquico global → repo → backlog → feature
- [ ] Env var interpolation funcional
- [ ] `msq config show` exibe config resolvida
