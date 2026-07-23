# Feature Specification: Queries agregadas de Analytics

**Feature Branch**: `feat/ana03-analytics-aggregate-queries`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M2  
**Depende de**: ANA-01, ANA-02

## Objetivo

Criar uma camada de consultas agregadas para Analytics, com filtros consistentes
e performance previsível. O front deve receber séries e rankings prontos, não
listas cruas enormes para recalcular tudo.

### Estado atual no código (verificado 2026-07-23)

- `StatsFilters` (`src/db/repo.ts`) hoje só tem `sinceDays`, `repoId`, `projectId`,
  `tool`. Faltam Epic, Work Item, model, status, stage, período absoluto e data
  quality — todos exigidos aqui. Não estender `StatsFilters` in-place se isso
  quebrar chamadores da TUI/stats; preferir um filtro tipado próprio de analytics.
- `listRunsForStats` não pagina (`ORDER BY r.id DESC`, sem `LIMIT/OFFSET`) e
  materializa todas as runs — inadequado para a listagem de Work Items paginada.
- `runs` não tem `epic_id`. Agregar `byEpic` exige join
  `runs.feature_id → backlog_features.epic_id`; runs cujo feature mudou de epic
  depois vão para `unknown/unscoped` (usar snapshot, não backlog atual — ver [[ANA-02]]).
- Índices já existentes: `idx_runs_project`, `idx_runs_project_status(project_id,
  status, id DESC)`. Faltam índices por `tool`, `model` (após [[ANA-02]]),
  `stage`, `started_at` e `feature_id`.

## Contrato técnico

```ts
getAnalyticsSummary(filters): AnalyticsSummary
listAnalyticsWorkItems(filters, pagination, sort): AnalyticsWorkItemRow[]
getTokenTimeSeries(filters, bucket): TokenTimeBucket[]
getTokenBreakdowns(filters): {
  byProject: TokenGroup[]
  byEpic: TokenGroup[]
  byRepository: TokenGroup[]
  byWorkItem: TokenGroup[]
  byTool: TokenGroup[]
  byModel: TokenGroup[]
  byStage: TokenGroup[]
  byStatus: TokenGroup[]
}
getAnalyticsDataQuality(filters): AnalyticsDataQuality
```

## Requirements

- Filtros: período absoluto/relativo, Project, Epic, Repository, Work Item, tool,
  model, status, stage e data quality.
- Buckets de tempo: day, week, month; opcionalmente hour para janela curta.
- Agregados incluem total/input/cached/output, runs, success rate, waste tokens,
  context avg/max/P95 e confidence.
- Project/Epic usam snapshots históricos quando existirem; dados sem snapshot
  aparecem em grupo `unknown/unscoped`.
- Queries paginam listagens e limitam rankings.
- Índices cobrem `started_at`, `project_id`, `repo_id`, `feature_id`, `tool`,
  `model`, `status`, `stage` e lifecycle quando aplicável.
- Nenhuma query agregada lê filesystem, specs ou registry de tools por item.

## Arquivos afetados

- `src/db/analytics.ts` — novo módulo de consultas.
- `src/db/index.ts` — índices/migrações.
- `src/db/repo.ts` — reuso ou extração de `listRunsForStats`.
- `src/core/stats.ts` — tipos e funções puras de agregação (`computeStats`,
  `aggregateTokens`) quando fizer sentido reusar.
- `tests/db/analytics.test.ts` — novo arquivo; fixtures de volume, filtros e planos.

## Fora de escopo

- Contrato WS/state (é [[ANA-04]]); aqui é só a camada DB/service.
- Cálculo de forecast/anomalia (é [[ANA-09]]/[[ANA-10]]).

## Success Criteria

- Filtro por Project retorna o mesmo conjunto de runs esperado por Board/Runs
  (mesma semântica de escopo de `listRunsForStats`).
- Ranking por Work Item não usa top 10 fixo; é paginado/ordenável.
- `byEpic` usa join por snapshot e joga runs sem epic resolvível em
  `unknown/unscoped`, sem sumir.
- Gráfico por tool/model vem de SQL/agregador, não de loop pesado no cliente.
- Fixture com milhares de runs não cria N+1; `EXPLAIN QUERY PLAN` das queries
  principais usa índice, não scan completo.

## Validação

Mudança em `src/db/` (ver `testing.md`):

```bash
rtk npm run build && rtk npm test && rtk npm run typecheck
rtk npx vitest run tests/db/analytics.test.ts tests/db/repo.test.ts tests/db/index.test.ts
```

Fixture de volume determinística via `src/db/fixtures.ts` sob banco sandbox
(`MSQ_DB_PATH`), nunca o catálogo global (ver `harness.md`).
