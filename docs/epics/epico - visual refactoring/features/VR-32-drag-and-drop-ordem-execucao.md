# Feature Specification: Ordenação do backlog por drag-and-drop

**Feature Branch**: `feat/vr32-drag-and-drop-ordem-execucao`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M8 (Tema H)
**Depende de**: VR-31
**Requer backend**: persistência de `position`

## Objetivo

Permitir **arrastar e soltar** para definir a ordem de execução das demandas no
backlog, persistindo a nova ordem.

## Contexto de execução

- `position` já existe como campo ordenável: `EpicSchema`/Work Item têm
  `position`; os modais de criação/edição (PF-04/PF-06) já editam `position`, e a
  ordenação "backlog order" aparece nos selects de ordem
  (`EpicDetailPage`/`ProjectDetailPage` order = `backlog`). Ou seja, o
  **backend/campo** existe; falta a **interação** de arrastar.
- O épico Projetos-Front declarou "reordenação por drag-and-drop" como
  **não-escopo/decisão aberta** (mover cima/baixo em PF-08) — este VR entrega o
  drag-and-drop completo.

O que **falta**: interação de drag-and-drop na lista (Work Items do Epic e/ou
Epics do Project) que atualize `position` e persista via a action de update
existente.

## Modelo técnico

- Drag-and-drop leve na lista ordenável (HTML5 DnD ou lib mínima já no bundle;
  evitar dependência nova pesada). Ao soltar, recomputar `position` dos itens
  afetados e despachar o update (`action:updateEpic`/update do Work Item com
  `position`).
- Respeitar `expectedRevision` e refletir sem reload; a ordem "backlog order"
  passa a refletir o drag.
- Conflito com dependências: a ordem manual não pode violar o grafo (VR-31) —
  sinalizar quando o drop contraria uma dependência.

## Requirements

- Arrastar um item define sua ordem de execução e persiste `position`.
- A nova ordem reflete sem reload e casa com "backlog order".
- Reordenar que viole dependências é sinalizado (coordena com VR-31).

## Arquivos afetados

- `src/web/client/pages/EpicDetailPage.tsx` (e/ou `ProjectDetailPage.tsx`),
  possível helper de reordenação em `lib/`.
- Backend: persistência de `position` (action existente).
- `tests/web/` — drag persiste ordem; violação de dep sinalizada.

## Success Criteria

- **SC-001**: arrastar e soltar reordena e persiste a ordem de execução.
- **SC-002**: a nova ordem reflete sem reload.
- **SC-003**: um drop que viola dependência é sinalizado.
