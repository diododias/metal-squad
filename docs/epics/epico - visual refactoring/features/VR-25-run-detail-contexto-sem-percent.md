# Feature Specification: Run Detail — janela de contexto sem `%` (corrige os 700%)

**Feature Branch**: `feat/vr25-run-detail-contexto-sem-percent`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M6 (Tema F)
**Depende de**: —

## Objetivo

A janela de contexto exibe porcentagens erradas (ex.: 700%). Simplificar para
**total consumido**, sem `%`, evitando a matemática frágil que gera o valor
absurdo.

## Contexto de execução

- `RunDetailPage.tsx:509` passa `contextPercent={formatPercent(run.contextWindowPercent)}`
  ao Run Summary; `AnalyticsPage.tsx:91,95` faz o mesmo com
  `formatPercent(run.contextWindowPercent)` e por task.
- `formatPercent` (`lib/format.ts:66`) apenas formata o número que recebe — o
  valor >100% vem da **origem** de `contextWindowPercent` (soma de janelas de
  múltiplas tasks/stages tratada como uma fração única, estourando 100%).
- `lib/workflow.ts:63` lê `task.contextWindowPercent` por task.

O que **falta**: parar de exibir a porcentagem agregada quebrada e mostrar o
**total de tokens de contexto consumido** (número absoluto, `formatTokens`), que
não sofre do problema de somar frações.

## Modelo técnico

- Na Run Detail (e Analytics, coordenando com `ANA`), trocar o campo "context
  X%" por "context: N tok" usando o total consumido (`formatTokens`), removendo
  `formatPercent(contextWindowPercent)` das superfícies.
- Se um percentual fizer sentido no futuro, ele exigiria a capacidade máxima da
  janela do modelo — fora de escopo aqui; a decisão é **remover o %**, não
  consertar a fração.

## Requirements

- Nenhuma superfície mostra porcentagem de contexto >100% (nem porcentagem).
- A janela de contexto aparece como total consumido em tokens.
- Consistência entre Run Detail e Analytics (coordenar com o épico Analytics).

## Arquivos afetados

- `src/web/client/pages/RunDetailPage.tsx`, `components/status/RunStatusStrip.tsx`
  (se exibe o campo), `pages/AnalyticsPage.tsx` (coordenar com `ANA`).
- `tests/web/` — ausência de `%` de contexto; total em tokens.

## Success Criteria

- **SC-001**: a janela de contexto na Run Detail aparece como total consumido,
  sem `%`.
- **SC-002**: não há mais valores como 700%.
- **SC-003**: Analytics e Run Detail exibem a mesma métrica de contexto.
