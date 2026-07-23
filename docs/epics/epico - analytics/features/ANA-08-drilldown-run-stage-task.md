# Feature Specification: Drilldown por run, stage e task

**Feature Branch**: `feat/ana08-run-stage-task-drilldown`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M3  
**Depende de**: ANA-04, ANA-05, ANA-12

## Objetivo

Permitir que o usuário investigue de onde veio o consumo de um Work Item: runs,
tentativas, stages, tasks, output resumido e eventos relevantes.

### Estado atual no código (verificado 2026-07-23)

- `task_runs` já guarda `input_tokens/cached_input_tokens/output_tokens/
  total_tokens/context_window_tokens` por task — fonte do breakdown por task.
- `retry_history` (com `tool`/`model`) agrupa tentativas; a timeline de runs deve
  usá-lo para juntar retries/resumes ao pipeline correto (`runs.pipeline_id`).
- Já existe `RunDetailPage.tsx` em `src/web/client/pages/` — o link "Open Run
  Detail" deve reusar essa rota, não duplicar.
- `runs.ended_at` é nullable e tokens podem ser `null`: run em andamento ou sem
  telemetria precisa de estado explícito, não zero.

## Requirements

- Painel/modal de drilldown por Work Item.
- Lista de runs do Work Item com stage, status, started/ended, duration,
  tool/model, tokens e context pressure.
- Breakdown por task quando `task_runs` tiver tokens.
- Eventos relevantes: retry, resume, gate wait, timeout, blocked, publish failure.
- Mostrar run sem tokens como lacuna de telemetria.
- Link para Run Detail existente quando houver.
- Separar consumo útil de waste por run/stage.

## Arquivos afetados

- `src/web/server.ts` — ação sob demanda de drilldown.
- `src/db/analytics.ts` — query de drilldown.
- `src/web/client/pages/AnalyticsPage.tsx`.
- `src/web/client/components/*` — modal/painel se necessário.
- `tests/web/server.test.ts` — contrato da ação sob demanda.
- `tests/web/analytics-page.test.tsx` — renderização do drawer.

## Fora de escopo

- Reescrever `RunDetailPage`; apenas linkar.
- Cálculo de anomalia/insight sobre a run (é [[ANA-09]]).

## Success Criteria

- A partir da tabela de Work Items, abrir drilldown sem carregar todos os detalhes
  no snapshot inicial (ação WS sob demanda de [[ANA-04]]).
- Run sem `ended_at` ou sem tokens aparece com estado explícito ("No token
  telemetry captured"), não como 0.
- Retentativas e retomadas aparecem agrupadas com a run/pipeline correta
  (`pipeline_id` + `retry_history`).
- Totais do drilldown batem com a linha do Work Item ([[ANA-05]]).

## Validação

Mudança em `src/web/` (ver `testing.md`):

```bash
rtk npm run build && rtk npm run typecheck
rtk npx vitest run tests/web/server.test.ts tests/web/analytics-page.test.tsx
```
