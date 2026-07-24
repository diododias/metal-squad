# Feature Specification: Ação "Aprovar" do Epic e Archive só após `done`

**Feature Branch**: `feat/vr06-aprovar-epic-archive-apos-done`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M1 (Tema A)
**Depende de**: VR-05
**Requer backend**: sim (action WS)

## Objetivo

Fechar o ciclo de vida do Epic: em `in_review`, um botão **Aprovar** leva o
Epic a `done`; em `done` o status não muda mais e a única ação é **Archive**.
Complementa VR-05 (que produz o `in_review`).

## Contexto de execução

- `LifecycleActions.tsx` já oferece `Archive`/`Delete`/`Restore` para Epic
  (`kind='epic'`) a partir de `allowed` — inclusive a confirmação tipada pelo
  nome. Falta a ação de **aprovação**, que é uma transição de status, não um
  verbo de lifecycle.
- A edição de status do Epic hoje é livre no `EpicEditor` (`action:updateEpic`
  com `status`). Com VR-05, o status passa a ser majoritariamente derivado — a
  aprovação é o ponto de decisão humana explícito.

O que **falta** (backend): uma action `action:approveEpic` (ou
`action:updateEpic` restrito a `in_review → done`) que só é permitida em
`in_review`; e a política de `allowed` do Epic passar a liberar `archive`
apenas após `done` (hoje o gate é execução/histórico, não o novo status).

## Modelo técnico

- **Backend**: transição `in_review → done` validada no servidor; recusa fora
  de `in_review`. Ajustar a policy para `archive` do Epic considerar `done`.
- **Contrato**: `action:approveEpic { epicId, expectedRevision }` em
  `web/types.ts`/`schemas.ts` (ou reuso de `updateEpic` com guarda de estado).
- **Front**: botão **Aprovar** visível só em `in_review` (ao lado das ações do
  Epic no molde de detalhe — VR-15); `Archive` só habilita em `done`
  (via `allowed`). `Delete` continua regido pela policy existente.

## Requirements

- **Aprovar** aparece só em `in_review` e move para `done`.
- `done` é terminal para status: nenhuma transição, só `Archive`.
- A aprovação usa `expectedRevision` (concorrência otimista, padrão
  `LifecycleActions`).

## Arquivos afetados

- Backend: policy/transição do Epic + `web/types.ts`, `web/schemas.ts`.
- `src/web/client/components/LifecycleActions.tsx` ou o molde de detalhe do Epic
  (VR-15) — botão Aprovar.
- `tests/web/`, `tests/db/` — aprovar só em `in_review`; archive só após `done`.

## Success Criteria

- **SC-001**: Epic em `in_review` mostra **Aprovar**; clicar move para `done`.
- **SC-002**: Epic `done` não oferece transição de status; oferece `Archive`.
- **SC-003**: tentar aprovar um Epic fora de `in_review` é recusado pelo
  servidor com mensagem acionável.
