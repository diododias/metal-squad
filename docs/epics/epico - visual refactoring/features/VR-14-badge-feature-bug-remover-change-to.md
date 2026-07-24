# Feature Specification: Badge `feature/bug` em todas as superfícies; remover "Change to XXX"

**Feature Branch**: `feat/vr14-badge-feature-bug-remover-change-to`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M3 (Tema C)
**Depende de**: —

## Objetivo

Tornar o tipo do Work Item (`feature`/`bug`) consistentemente visível — inclusive
na Run Detail, onde some hoje — e remover o gatilho de UI "Change to XXX", já que
o tipo é escolhido **na criação** e não deve mudar depois.

## Contexto de execução

- O badge de tipo já aparece no card (`KanbanCard.tsx`, `run.workItemType`) e no
  `BacklogItemDetail.tsx:186` (`feature.workItemType`, com "type is locked"
  quando há histórico, `:194`).
- A **troca de tipo** ainda tem UI ativa no `BacklogItemDetail`:
  `Change type: {workItemType} → {proposedType}` (`:211`), com preview/commit via
  `action:changeWorkItemType` (`:115`, `:122`). O `CreateWorkItemModal` já aponta
  a troca pós-criação para lá (`:44`).
- A Run Detail (`RunDetailPage.tsx`) **não** renderiza o badge de tipo — é o gap
  citado no `plan.md`.

O que **falta**: (1) renderizar o badge feature/bug na Run Detail; (2) remover a
UI de `changeWorkItemType` do `BacklogItemDetail` (a action permanece no backend
como compatibilidade, mas sem gatilho na tela).

## Modelo técnico

- Extrair o badge de tipo num pequeno componente reusável
  (`components/data/WorkItemTypeBadge.tsx`) a partir do markup já repetido em
  `KanbanCard`/`BacklogItemDetail`, e usá-lo na Run Detail (header).
- Remover em `BacklogItemDetail` o bloco de troca de tipo (`:211` e handlers
  `:115`/`:122`); manter apenas a exibição do tipo (com o "locked" quando há
  histórico deixando de ser necessário, já que não há mais troca).

## Requirements

- O badge feature/bug aparece na lista, no card e na Run Detail.
- Não há mais botão/fluxo de troca de tipo na UI.
- A action `action:changeWorkItemType` continua existindo no backend (não é
  removida), apenas sem gatilho de UI.

## Arquivos afetados

- `src/web/client/components/data/WorkItemTypeBadge.tsx` (novo, extração).
- `src/web/client/pages/RunDetailPage.tsx` (adiciona badge),
  `pages/BacklogItemDetail.tsx` (remove troca), `components/data/KanbanCard.tsx`
  (usa o componente).
- `tests/web/` — badge na Run Detail; ausência do fluxo de troca.

## Success Criteria

- **SC-001**: a Run Detail exibe o badge feature/bug.
- **SC-002**: o `BacklogItemDetail` não oferece mais troca de tipo.
- **SC-003**: o badge é o mesmo componente nas três superfícies.
