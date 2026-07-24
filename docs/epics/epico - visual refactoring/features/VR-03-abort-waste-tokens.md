# Feature Specification: Abort contabiliza WASTE TOKENS

**Feature Branch**: `feat/vr03-abort-waste-tokens`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M1 (Tema A)
**Depende de**: VR-02
**Requer backend**: sim (telemetria/persistência)

## Objetivo

Quando um Work Item já iniciado é abortado (`Abort`), os tokens gastos até ali
não somem: são marcados como **WASTE TOKENS** e exibidos como tal. Fecha a
distinção do `plan.md` entre `Delete` (nunca iniciado, sem custo) e `Abort`
(iniciado, custo real assumido como desperdício).

## Contexto de execução

- O card e a Run Detail já exibem tokens: `KanbanCard` mostra
  `formatTokens(run.tokens)`; `RunDetailPage` agrega por stage
  (`summarizeTaskRuns`, `formatTokens(g.totalTokens)`). Não há hoje o conceito
  de "waste".
- O lifecycle de abort existe (`action:resumeWithOverride`/abort na Run Detail;
  `pipelineStatus === 'aborted'`). Falta **rotular** os tokens da run abortada.
- Persistência de tokens vive em `src/db/` (runs/task_runs). O total de tokens
  por run já é somado para o card/analytics.

O que **falta** (backend): quando uma run entra em `aborted`, marcar seus
tokens acumulados como waste — via coluna/flag derivada no `db/repo.ts` (ou
projeção no `RunSummary`) — e propagar `wasteTokens` no snapshot WS
(`MsqWebState`). Front: badge/label "WASTE" onde os tokens da run abortada
aparecem.

## Modelo técnico

- **DB/repo**: expor `wasteTokens` no `RunSummary` (derivado: `tokens` da run
  quando `status === 'aborted'`), sem migração destrutiva — projeção na query,
  não nova gravação, se possível.
- **Contrato WS**: adicionar `wasteTokens?` no tipo de run em `web/types.ts` +
  `web/schemas.ts`.
- **Front**: `KanbanCard` e `RunDetailPage` renderizam `formatTokens(wasteTokens)
  tok · WASTE` com tom de atenção (`--accent-warn`) para runs abortadas;
  Analytics pode somar waste separadamente (cross-ref épico Analytics `ANA-09`,
  que já trata anomalias/waste — **coordenar, não duplicar**).

## Requirements

- Abortar uma run com tokens gastos marca esses tokens como waste, visível no
  card e na Run Detail.
- `Delete` (item nunca iniciado) não produz waste — não há custo.
- A contabilização é derivada de estado (`aborted`), sem gravação manual pelo
  usuário.

## Arquivos afetados

- `src/db/repo.ts` — projeção `wasteTokens` no `RunSummary`.
- `src/web/types.ts`, `src/web/schemas.ts` — contrato.
- `src/web/client/components/data/KanbanCard.tsx`,
  `src/web/client/pages/RunDetailPage.tsx` — render do label WASTE.
- `tests/db/repo.test.ts`, `tests/web/` — waste em run abortada; ausência em
  item nunca iniciado.

## Success Criteria

- **SC-001**: abortar uma run com N tokens exibe `N tok · WASTE` no card e na
  Run Detail.
- **SC-002**: um item deletado antes de iniciar não gera nenhum registro de
  waste.
- **SC-003**: o total de waste é consistente entre card, Run Detail e a query
  do repo (coberto por teste).
