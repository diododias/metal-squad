# Feature Specification: KanbanCard — `Start`/`Resume` no card, dep-ok e auto adv/start visíveis

**Feature Branch**: `feat/vr23-kanbancard-start-resume-dep-ok`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M6 (Tema F)
**Depende de**: VR-02

## Objetivo

Trazer as ações contextuais para o próprio card: **Start** em `TODO`,
**Resume** em `BLOCKED`, um ícone sinalizando **dependências OK** (ou o que
falta, quando bloqueado), e tornar **Auto Advance / Auto Start** visíveis no
card.

## Contexto de execução

- O card já embute `LifecycleActions` (via prop `lifecycle`) com
  `stopPropagation` para não navegar (`KanbanCard.tsx`, bloco final). Falta
  `Start`/`Resume` — que VR-02 unifica em `WorkItemActions`.
- Tool rail já mostra `auto` quando `run.autoAdvance` (`buildToolRailCells`,
  cell `key:'auto'`), mas **não** mostra `autoStart` (existe em
  `feature.autoStart`, ainda não exposto no card).
- Dependências: `startEligibility` já computa `blockedByDependencies`; o
  `DependencyTag` sabe pintar done/failed. Falta um **ícone consolidado** de
  "deps OK / faltam X" no card.

O que **falta**: renderizar no card `Start` (TODO, via eligibility), `Resume`
(BLOCKED), o indicador dep-ok, e uma célula/óbvio para `autoStart` além de
`autoAdvance`.

## Modelo técnico

- Card consome `WorkItemActions` (VR-02) no lugar/junto de `LifecycleActions`,
  passando `startEligibility` e `pillStatus`.
- `buildToolRailCells`: adicionar célula `autoStart` (ícone próprio) quando
  `run.autoStart`; manter `auto` (advance).
- Indicador dep-ok: pequeno ícone/badge derivado de
  `startEligibility.blockedByDependencies` (vazio → "deps ok"; não vazio →
  "faltam: …" no `title`).

## Requirements

- Card em `TODO` oferece `Start` (respeitando eligibility); em `BLOCKED`,
  `Resume`.
- Auto Advance e Auto Start são visíveis no card quando ligados.
- O card sinaliza deps OK ou o que falta, sem abrir o detalhe.

## Arquivos afetados

- `src/web/client/components/data/KanbanCard.tsx`,
  `components/WorkItemActions.tsx` (VR-02), `lib/startEligibility.ts` (reuso).
- `tests/web/kanban-card.test.tsx` — Start/Resume por estado; dep-ok; auto flags.

## Success Criteria

- **SC-001**: iniciar um item elegível direto do card (TODO) sem abrir o
  detalhe.
- **SC-002**: retomar um item `BLOCKED` pelo card (Resume).
- **SC-003**: o card mostra Auto Advance/Auto Start e o estado das dependências.
