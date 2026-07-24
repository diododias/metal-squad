# Feature Specification: Padrão de save global por página (dirty state + botão único)

**Feature Branch**: `feat/vr08-save-global-dirty-state`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M2 (Tema D)
**Depende de**: —

## Objetivo

Estabelecer um único padrão de salvamento por página: qualquer campo alterado
marca a página como _dirty_ e revela/ativa **um** botão Salvar global. Substitui
o modelo atual de save por bloco (cada Card com seu "save runtime" / "save
defaults" / "save notifications"), fonte de confusão e de perda silenciosa.

## Contexto de execução

Estado atual (fragmentado):

- `pages/ConfigPage.tsx` tem **um botão de save por sub-tab**: `save runtime`
  (`:147`), `save defaults` (`:375`), `save notifications` (`:572`), `save
  budget` (`:602`), cada um com seu próprio `canSave = changed && valid` e sua
  própria `action:update*`.
- `pages/BacklogItemDetail.tsx` salva a spec por bloco (`disabled={!specDirty}`,
  `:244`) e delega o resto a `FeatureConfigDetail`, que tem baselines/patches
  separados para execução e workflow.
- Os primitivos de edição existem: `components/core/EditableTextField.tsx`,
  `EditableSelectField`, `EditableToggleField`, `EditableFieldShell` — todos com
  `value`/`initialValue`.

O que **falta**: um contêiner de dirty-state por página que agregue os drafts
dos blocos, exponha `isDirty` e concentre o commit num único botão (que pode
despachar múltiplas `action:update*` quando a página tem mais de um domínio).

## Modelo técnico

- `hooks/usePageDirtyState.ts` (novo) ou `components/core/SaveBar.tsx`: registra
  drafts/baselines dos blocos, computa `isDirty` e valida antes de habilitar
  Salvar; ao salvar, despacha as actions dos blocos alterados.
- `ConfigPage`: manter as `action:update*` por domínio, mas orquestradas por um
  único botão Salvar da página (não um por Card).
- Reuso dos `Editable*Field` sem reescrever os primitivos; a mudança é de
  orquestração, não de widget.

## Requirements

- Uma página = um botão Salvar (não por bloco); só ativo quando `isDirty` e
  válido.
- O dirty-state agrega todos os campos editáveis da página.
- Salvar despacha as actions necessárias e limpa o dirty.
- Base reutilizável por Settings, Work Item e Epic (VR-10/VR-11).

## Arquivos afetados

- `src/web/client/hooks/usePageDirtyState.ts` ou
  `components/core/SaveBar.tsx` (novo).
- `src/web/client/pages/ConfigPage.tsx` — consolida os saves por tab.
- `tests/web/config-page.test.tsx` — dirty agregado, botão único, commit.

## Success Criteria

- **SC-001**: alterar qualquer campo de uma página revela/ativa um único botão
  Salvar.
- **SC-002**: salvar despacha as actions dos blocos alterados e zera o
  dirty-state.
- **SC-003**: página sem alterações mantém o botão Salvar inativo.
