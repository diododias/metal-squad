# Feature Specification: Waste, anomalias e alertas de consumo

**Feature Branch**: `feat/ana09-token-waste-anomalies`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M5  
**Depende de**: ANA-03, ANA-04, ANA-05, ANA-07

## Objetivo

Adicionar uma camada analítica que mostre desperdício e anomalias, priorizando
ações concretas: quais Work Items, stages, tools ou modelos consumiram muito sem
entrega proporcional.

### Estado atual no código (verificado 2026-07-23)

- `src/core/stats.ts` já tem funções puras (`computeStats`, `aggregateTokens`);
  baseline/P95/outlier devem entrar como funções puras aqui, testadas em
  `tests/core/stats.test.ts`/`stats-extended.test.ts`.
- Status de run vêm de `runs.status` (`failed`/`aborted`/`blocked`/`done`/...);
  retries/resumes de `retry_history` + `pipeline_id`. Waste precisa da semântica de
  double-counting fechada em [[ANA-00]] para não inflar somando cada tentativa.
- `unknown/invalid` (de [[ANA-01]]) deve poder ser excluído de comparativos sem
  perder a contagem — o cálculo de baseline não pode misturar dado inválido.

## Requirements

- Métricas de waste:
  - tokens em `failed`, `aborted`, `blocked`;
  - retries;
  - resumes que não chegaram a `done`;
  - runs superseded quando aplicável;
  - gate/timeout loops com consumo repetido.
- Ranking de anomalias:
  - run acima de P95/P99 do período;
  - Work Item com crescimento abrupto;
  - tool/model com aumento de avg tokens/run;
  - context window acima de limiar;
  - data quality inválida.
- Alertas visuais na página, sem notificação externa obrigatória neste item.
- Explicar cada alerta com evidência: período, baseline, valor observado e link
  para drilldown.
- Permitir ocultar dados `unknown` de análises comparativas, mantendo contagem.

## Arquivos afetados

- `src/db/analytics.ts` — queries de waste/anomalia.
- `src/core/stats.ts` — funções puras de cálculo de baseline/outlier.
- `src/web/types.ts` — `AnalyticsInsight`.
- `src/web/client/pages/AnalyticsPage.tsx` — seção Insights/Waste.
- `tests/db/analytics.test.ts` e `tests/core/stats.test.ts`.

## Fora de escopo

- Forecast de budget e export (é [[ANA-10]]).
- Notificação externa (Telegram/desktop); só alerta visual na página.

## Success Criteria

- Dataset com runs falhas caras gera ranking de waste.
- Uma run outlier mostra baseline e valor observado.
- Waste não conta em dobro tentativas do mesmo pipeline além do definido em [[ANA-00]].
- Dados inválidos geram alerta de data quality, não entram silenciosamente na média.
- Cada insight possui link/filtro para investigação.

## Validação

Mudança em `src/db/` + `src/core/` (ver `testing.md`):

```bash
rtk npm run build && rtk npm test && rtk npm run typecheck
rtk npx vitest run tests/db/analytics.test.ts tests/core/stats.test.ts tests/core/stats-extended.test.ts
```
