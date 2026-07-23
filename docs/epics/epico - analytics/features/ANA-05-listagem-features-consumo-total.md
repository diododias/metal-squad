# Feature Specification: Listagem completa de Work Items por consumo total

**Feature Branch**: `feat/ana05-work-item-token-ledger`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M3  
**Depende de**: ANA-04, ANA-12

## Objetivo

Adicionar uma tabela completa de Work Items em Analytics, ordenável e filtrável,
mostrando consumo total de tokens e indicadores operacionais. Essa é a principal
resposta ao uso diário: “quais features consumiram mais e por quê?”.

### Estado atual no código (verificado 2026-07-23)

- A página hoje (`AnalyticsPage.tsx`) usa `state.dashboard.rows` e mostra top 10
  features; esta feature substitui isso por consulta paginada de [[ANA-04]].
- Existe `Table.tsx` em `src/web/client/components/data/`; avaliar se já suporta
  ordenação server-side/paginação antes de criar componente novo.
- `AnalyticsWorkItemRow` é produzido por `listAnalyticsWorkItems` ([[ANA-03]]);
  esta feature consome, não recalcula agregados no cliente.

## Requirements

- Tabela paginada com todos os Work Items do escopo, não apenas top 10.
- Colunas mínimas:
  - Project;
  - Epic;
  - Repository;
  - Work Item ID/título/tipo;
  - status derivado;
  - total tokens;
  - input/cached/output;
  - runs;
  - done/failed/blocked/aborted;
  - waste tokens;
  - última run;
  - tool/model predominante;
  - maior `context_window_percent`;
  - data quality/confidence.
- Ordenação por tokens totais, waste, runs, última execução e pressão de contexto.
- Filtros por período, status, tool, model, Project/Epic/Repository e data quality.
- Clique na linha abre drilldown do Work Item ou filtra a página.
- Estado vazio e estado `unknown` devem ser explícitos.

## Arquivos afetados

- `src/web/client/pages/AnalyticsPage.tsx` — nova seção/tabela.
- `src/web/client/components/data/Table.tsx` — melhorias se necessário para
  paginação/ordenção/accessibilidade.
- `src/web/client/lib/format.ts` — formatação de tokens, percentuais e confidence.
- `src/web/types.ts` — `AnalyticsWorkItemRow`.
- `tests/web/analytics-page.test.tsx` — renderização/ordenação/filtros da tabela.

## Fora de escopo

- Conteúdo do drawer/drilldown (é [[ANA-08]]); aqui basta abrir/roteamento.
- Gráficos (é [[ANA-06]]/[[ANA-07]]).

## Success Criteria

- Um dataset com mais de 10 Work Items mostra paginação e ordenação correta.
- Ordenação de colunas de alto volume é server-side (não reordena página local).
- Work Item sem Project/model aparece como `unknown`, não desaparece; sem tokens
  aparece com `—`, não some.
- Valores da tabela batem com a query agregada de backend ([[ANA-03]]).
- Clique em uma linha permite chegar ao drilldown associado.

## Validação

Mudança em `src/web/client/` (ver `testing.md`):

```bash
rtk npm run build && rtk npm run typecheck
rtk npx vitest run tests/web/analytics-page.test.tsx
```
