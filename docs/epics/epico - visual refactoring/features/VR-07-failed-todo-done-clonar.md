# Feature Specification: Work Item — `Failed → TODO/Done` e `Done → Clonar`

**Feature Branch**: `feat/vr07-failed-todo-done-clonar`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M1 (Tema A)
**Depende de**: VR-02

## Objetivo

Dar saída aos estados terminais do Work Item conforme o `plan.md`: um item
`FAILED` pode **voltar para TODO** (reeditar parâmetros e reiniciar) ou ser
marcado **DONE** manualmente; um item `DONE` ganha a opção **Clonar** (nova
demanda com a mesma configuração).

## Contexto de execução

- O estado terminal existe: `RunSummary['status']` cobre `failed`/`aborted`/
  `done` (`RunDetailPage.isTerminalRunStatus`). A pill já pinta `failed`/`done`.
- Reset e clone não existem hoje como ação de UI. `action:startFeature` reinicia
  a partir de `TODO`; não há um verbo "reabrir failed" nem "clonar".
- A criação de Work Item existe (`action:createWorkItem`, com `title`, `repoId`,
  `workItemType`, `dependsOn` — `types.ts:571`), base para o clone.

O que **falta**: (1) `Failed → TODO`: limpar/arquivar a run falha e devolver o
item ao pool de `TODO` (candidato a reuso de start após reset); (2) `Failed →
Done` manual: transição explícita; (3) `Done → Clonar`: criar novo Work Item
copiando spec/tool/deps do concluído via `action:createWorkItem`. Avaliar se
(1)/(2) exigem backend (provável) ou se compõem de actions existentes.

## Modelo técnico

- **Clonar** (front-first): botão em item `done` abre o modal
  `CreateWorkItemModal` (já existente) pré-preenchido com `title (copy)`,
  `repoId`, `workItemType`, `dependsOn`, spec — usando `action:createWorkItem`.
  Nenhuma action nova.
- **Failed → TODO / Failed → Done**: transições de estado do Work Item; se não
  houver action equivalente, declarar dependência de backend (verbo de reset/
  mark-done) seguindo o padrão de `web/types.ts`/policy. Botões só visíveis em
  `failed`.

## Requirements

- Item `failed` oferece **Voltar para TODO** e **Marcar como Done**; nenhum dos
  dois aparece em outros estados.
- Item `done` oferece **Clonar**, que cria um novo Work Item com a mesma config
  (reusando o modal e `action:createWorkItem`).
- Reabrir/clonar respeita `expectedRevision` quando alterar o item original.

## Arquivos afetados

- `src/web/client/components/WorkItemActions.tsx` (VR-02) — botões condicionais.
- `src/web/client/components/project/CreateWorkItemModal.tsx` — modo "clonar"
  (pré-preenchido).
- Backend (se necessário): transição reset/mark-done do Work Item.
- `tests/web/` — visibilidade por estado; clone cria item equivalente.

## Success Criteria

- **SC-001**: item `failed` volta para `TODO` e pode ser reiniciado.
- **SC-002**: item `failed` pode ser marcado `Done` manualmente.
- **SC-003**: **Clonar** num item `done` abre o modal já preenchido e cria um
  novo Work Item com a mesma configuração.
