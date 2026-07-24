# Feature Specification: KanbanCard — timelapse ao vivo (segundo a segundo)

**Feature Branch**: `feat/vr21-kanbancard-timelapse-ao-vivo`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M6 (Tema F)
**Depende de**: VR-01

## Objetivo

No card de um Work Item em execução, o tempo de processamento deve contar **ao
vivo, segundo a segundo**, transmitindo que o app está trabalhando — em vez de
um valor estático que só muda a cada re-render.

## Contexto de execução

- Hoje `elapsed` chega como **string já formatada e estática**:
  `BoardPage.tsx:224` calcula `formatElapsed(r.startedAt, r.endedAt)` uma vez, e
  o `KanbanCard` só imprime `{run.elapsed}` (`:214`). Não há timer.
- `lib/format.ts` tem `formatElapsed(startedAt, endedAt)`; o dado bruto
  `startedAt` existe na run (usado no cálculo). `RunStatusStrip` também recebe
  `elapsed` estático.

O que **falta**: para runs ativas (`running`), o card precisa de `startedAt` e
de um tick de 1s para recomputar o elapsed localmente; runs terminadas mantêm o
valor congelado (endedAt).

## Modelo técnico

- `hooks/useLiveElapsed.ts` (novo): dado `startedAt` e um flag `active`,
  retorna o elapsed formatado, atualizando via `setInterval(1000)` só enquanto
  `active`; limpa o intervalo ao desmontar/terminar.
- `KanbanCardRun` passa a aceitar `startedAt` (bruto) + `status`; o card usa
  `useLiveElapsed(startedAt, status === 'running')` e cai no valor estático para
  estados terminais.
- Um único intervalo por card ativo; nada de timer global custoso.

## Requirements

- Card `running` conta o tempo segundo a segundo.
- Card terminado (done/failed/aborted) mostra o elapsed final congelado.
- Sem vazamento de `setInterval` (limpeza no unmount/terminação).

## Arquivos afetados

- `src/web/client/hooks/useLiveElapsed.ts` (novo),
  `components/data/KanbanCard.tsx`, `pages/BoardPage.tsx` (passa `startedAt`).
- `tests/web/` — tick ativo em running; congelado em terminal; cleanup.

## Success Criteria

- **SC-001**: um card em `running` incrementa o tempo a cada segundo.
- **SC-002**: ao terminar, o tempo para no valor final.
- **SC-003**: desmontar o card não deixa timers ativos.
