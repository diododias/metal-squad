# F14 — Budget Caps & Cost Controls

**Epic**: [E03 — Orchestration v2](../epics/E03-orchestration-v2.md)
**Prioridade**: Alta
**Esforco**: Medium

## Problema

Sem controle de custo, um pipeline pode gastar centenas de dolares inesperadamente. Nao ha como definir um teto de gastos.

## Solucao

### Configuracao de budget

```yaml
# backlog.yaml
budget:
  maxTokens: 500000          # tokens totais
  maxCostUsd: 10.00          # custo estimado maximo
  perFeatureMaxTokens: 100000 # por feature
```

```json
// config.json
{
  "budget": {
    "defaultMaxCostUsd": 5.00,
    "alertAtPercent": 80
  }
}
```

### Enforcement

- Antes de despachar uma feature, verifica se o budget global restante comporta
- Se exceder, cria gate para aprovacao humana
- Alerta no Telegram/TUI quando atinge X% do budget

### Tracking

- Custo acumulado calculado em tempo real via pricing table
- Armazenado no DB por run

## Criterios de aceite

- [ ] Budget configuravel no YAML e config global
- [ ] Pausa automatica quando budget excedido
- [ ] Alerta quando atinge threshold configuravel
- [ ] Custo estimado visivel na TUI
