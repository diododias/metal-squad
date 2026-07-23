# Feature Specification: Performance, testes e regressão E2E

**Feature Branch**: `feat/ana11-analytics-performance-e2e`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M6  
**Depende de**: ANA-05, ANA-06, ANA-07, ANA-08, ANA-09, ANA-10

## Objetivo

Fechar o épico com cobertura de regressão, fixtures de volume e documentação de
operação. Analytics deve continuar rápido e confiável mesmo com histórico grande.

### Estado atual no código (verificado 2026-07-23)

- `src/db/fixtures.ts` já existe e **recusa o banco global** (exige `MSQ_DB_PATH`
  sandbox); a fixture de volume entra como novo cenário aqui, ids estáveis e
  aplicação idempotente (padrão `fix-*`), rodada via
  `scripts/with-sandbox-db.mjs` (ver `harness.md`).
- `gate:full` já roda em banco sandbox descartável; o teste de performance não
  pode tocar `~/.local/share/metal-squad/app.db`.
- Suítes-alvo já existentes: `tests/db/analytics.test.ts` (nova, de [[ANA-03]]),
  `tests/web/server.test.ts`, `tests/web/analytics-page.test.tsx`.

## Requirements

- Fixture de volume com múltiplos Projects, Epics, repos, Work Items, tools,
  modelos, statuses, stages e dados incompletos.
- Teste de performance das queries principais com limite documentado.
- Teste E2E web cobrindo:
  - filtros por Project/Epic/tool/model;
  - tabela de Work Items;
  - drilldown;
  - export;
  - grupos `unknown`.
- Teste de consistência: soma de breakdowns bate com resumo.
- Documentar uso da página e semântica das métricas no README/docs do repo.
- Validar que o state push padrão não cresce proporcionalmente ao número total
  de runs.

## Arquivos afetados

- `tests/db/analytics.test.ts`.
- `tests/web/server.test.ts`.
- `tests/web/analytics-page.test.tsx` — suíte da página React (a `tests/ui/` é da
  TUI aposentada).
- `src/db/fixtures.ts` — fixture determinística de volume (novo cenário).
- `tests/fixtures/scenarios/*.backlog.yaml` — cenário versionado da fixture.
- `README.md` e/ou docs operacionais.

## Fora de escopo

- Adicionar novas métricas/telas; este item só fecha regressão e docs.

## Success Criteria

- Baseline de build/test/typecheck passa.
- Fixture de volume prova ausência de N+1 perceptível (`EXPLAIN QUERY PLAN` usa
  índice nas queries principais).
- E2E cobre filtros, drilldown, export e grupos `unknown`.
- Soma dos breakdowns bate com o resumo (teste de consistência).
- Documentação final explica métricas, caveats e tratamento de dados antigos.

## Validação

Fechamento do épico — bateria completa em banco sandbox (ver `testing.md`/`harness.md`):

```bash
rtk npm run gate:full
rtk npx vitest run tests/db/analytics.test.ts tests/web/server.test.ts tests/web/analytics-page.test.tsx
```
