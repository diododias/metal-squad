# F22 — Per-Repo Config Overrides

**Epic**: [E05 — Developer Experience](../epics/E05-dx-improvements.md)
**Prioridade**: Media
**Esforco**: Low

## Problema

Config era apenas global (`~/.config/metal-squad/config.json`). Repos diferentes podem precisar de concurrency, timeout, notifications e defaults de execucao diferentes sem contaminar outros checkouts.

## Solucao

### Arquivo `.msq/config.yaml` no repo

```yaml
runtime:
  concurrency: 5
  notifications:
    channels:
      - type: slack
        webhookUrl: ${SLACK_WEBHOOK_URL}
defaults:
  tool: codex
  model: gpt-5.4
  effort: high
  skills:
    - speckit-implement
  stageSkills:
    plan:
      - speckit-plan
      - speckit-tasks
```

## Comportamento entregue

- `src/config/index.ts` agora carrega `~/.config/metal-squad/config.json` e, quando presente, `.msq/config.yaml`.
- Valores `${ENV_VAR}` sao interpolados recursivamente antes da validacao. Variavel ausente gera erro com o caminho do campo.
- `src/core/backlog/load.ts` incorpora defaults do repo durante a hidratacao do backlog e do catalogo.
- `msq config show [--feature <id>] [--json]` exibe a config runtime resolvida, as fontes usadas e os defaults/overrides efetivos.
- TUI e web passam a expor o resumo das fontes/defaults resolvidos junto do catalogo.

### Merge logic

1. Global config (base)
2. Repo config (override)
3. Backlog-level defaults (override)
4. Feature-level (override)

### Env var interpolation

`${ENV_VAR}` sao resolvidos no load, permitindo valores sensiveis sem hardcoding. Se a variavel nao existir, o erro menciona `.msq/config.yaml` e o caminho do campo afetado.

## Precedencia

1. Config global: `~/.config/metal-squad/config.json`
2. Config do repo: `.msq/config.yaml`
3. Defaults do backlog: `backlog.yaml -> defaults`
4. Override da feature: `backlog.yaml -> epics[].features[]`

Camadas posteriores sobrescrevem apenas os campos que declararem explicitamente.

## Inspecao

```bash
rtk node dist/index.js config show
rtk node dist/index.js config show --feature feat-22 --json
```

## Criterios de aceite

- [x] `.msq/config.yaml` detectado e aplicado
- [x] Merge hierarquico global → repo → backlog → feature
- [x] Env var interpolation funcional
- [x] `msq config show` exibe config resolvida
