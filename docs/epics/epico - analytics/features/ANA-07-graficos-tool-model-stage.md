# Feature Specification: Gráficos por tool, modelo e stage

**Feature Branch**: `feat/ana07-tool-model-stage-charts`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M4  
**Depende de**: ANA-02, ANA-03, ANA-04, ANA-12

## Objetivo

Exibir consumo por executor real: tool, modelo, effort/thinking e stage. Essa
visão deve ajudar a comparar ferramentas, identificar modelos caros e encontrar
stages que dominam o gasto.

### Estado atual no código (verificado 2026-07-23)

- `runs.tool` e `runs.stage` existem; **modelo/effort não** — dependem do snapshot
  de [[ANA-02]]. Sem ele, o gráfico por modelo é majoritariamente `unknown`.
- `retry_history` (com `tool`/`model`) é a evidência para "iniciou com uma tool e
  terminou com outra" (fallback/retry).
- `runs.stage` é texto livre (nullable); stages custom não podem quebrar
  ordenação nem virar bucket vazio silencioso.
- Agregados por tool/model/stage vêm de `src/db/analytics.ts` ([[ANA-03]]), não de
  loop no cliente.

## Requirements

- Gráfico por tool: tokens, runs, avg tokens/run, waste e success rate.
- Gráfico por modelo: tokens, runs, confidence `exact|derived|unknown`.
- Gráfico por stage: specify/plan/tasks/implement/validate ou stages custom.
- Filtro cruzado: clicar em tool/model/stage aplica filtro no restante da página.
- Mostrar `unknown model` quando run antiga não tiver snapshot confiável.
- Mostrar fallback/retry quando uma feature iniciou com uma tool e terminou com outra.
- Mostrar effort/thinking como breakdown secundário quando disponível.
- Não classificar modelo a partir do backlog atual quando o snapshot da run não existe.

## Arquivos afetados

- `src/web/client/pages/AnalyticsPage.tsx`.
- `src/web/client/components/data/*` — gráficos/listas.
- `src/web/types.ts` — grupos `AnalyticsTokenGroup`.
- `src/db/analytics.ts` — agregados por tool/model/stage.
- `tests/db/analytics.test.ts` — agrupamento exato/derived/unknown.
- `tests/web/analytics-page.test.tsx` — interação de filtros.

## Fora de escopo

- Gerar/backfill do snapshot de modelo (é [[ANA-02]]); aqui só consome.
- Ranking de anomalia por tool/model (é [[ANA-09]]).

## Success Criteria

- Runs novas aparecem no modelo correto por snapshot.
- Runs antigas sem evidência aparecem em `unknown model` (não classificadas pelo
  backlog atual).
- Tool/model/stage têm totais coerentes com o resumo do filtro.
- Stage custom não quebra gráfico nem ordenação.

## Validação

Mudança em `src/db/` + `src/web/` (ver `testing.md`):

```bash
rtk npm run build && rtk npm test && rtk npm run typecheck
rtk npx vitest run tests/db/analytics.test.ts tests/web/analytics-page.test.tsx
```
