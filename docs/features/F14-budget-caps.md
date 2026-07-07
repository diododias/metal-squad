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

- [x] Budget configuravel no YAML e config global
- [x] Pausa automatica quando budget excedido
- [x] Alerta quando atinge threshold configuravel
- [x] Custo estimado visivel na TUI

## Implementacao (2026-07-07)

- `BudgetSchema` no backlog (`budget:` na raiz, v1 e v2): `maxTokens`, `maxCostUsd`, `perFeatureMaxTokens`.
- `budget` no `config.json`: `defaultMaxCostUsd` (fallback quando o backlog nao define `maxCostUsd`) e `alertAtPercent` (default 80).
- Pricing extraido de `src/ui/format.ts` para `src/core/pricing.ts` (compartilhado entre TUI e orquestrador; a UI re-exporta).
- `src/core/orchestrator/budget.ts`: `resolveBudgetLimits` + `createBudgetTracker` — acumula tokens/custo por pipeline e por feature, emite `budget:alert` uma vez ao cruzar o threshold e outra ao exceder (ja roteado para Telegram/TUI via event bus).
- Scheduler ganhou hook `beforeDispatch`: quando o budget global esta esgotado, o scheduler entra em `paused` (persiste `pausePipeline`) em vez de despachar; `resume` re-checa o budget.
- Runs subsequentes de uma feature que excedeu `perFeatureMaxTokens` (fluxo staged) sao bloqueadas com gate para decisao humana.
- Custo estimado na TUI ja existia via `estimateCost` na StatusBar.

Testes: `tests/orchestrator/budget.test.ts` (tracker, limites, alertas, pausa via `beforeDispatch`), `tests/backlog/schema.test.ts` (parse do bloco budget), `tests/config/index.test.ts` (defaults).
