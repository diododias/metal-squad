# Feature Specification: Settings › Defaults › Skills — fim da perda silenciosa

**Feature Branch**: `feat/vr10-settings-skills-salvar`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M2 (Tema D)
**Depende de**: VR-08

## Objetivo

Corrigir o bug de confiança citado no `plan.md`: o usuário altera as skills em
Settings, tira o foco e a alteração **some sozinha**. Trazer o campo para o
padrão de save global (VR-08) para que o valor editado persista até o commit
explícito.

## Contexto de execução

Localização exata do bug: **Settings › Defaults** (não a tab "Skills", que é
read-only). Em `pages/ConfigPage.tsx`:

- `DefaultsTab` mantém as skills como campo CSV: `skills: defaults.skills.join(',
  ')` (`:198`) e `stageSkills` por stage (`:199`, `:344-349`), via
  `EditableTextField` com `value={draft.skills}` e `initialValue={baseline.skills}`
  (`:306-311`).
- Há um `save defaults` (`:375`, `action:updateProjectDefaults`) com
  `canSave = Object.keys(patch).length > 0 && guidance === undefined` (`:263`).
- O sumiço vem do `EditableFieldShell`/`EditableTextField`: no blur sem commit,
  o campo reverte para `initialValue`, dando a sensação de "apaguei e voltou".

A tab **Skills** (`SkillsTab`, `:471`) só lista o catálogo descoberto
(`repo > global > external > builtin`) — não é editável e não é o alvo.

## Modelo técnico

- Ligar o campo de skills do `DefaultsTab` ao dirty-state global (VR-08): o
  draft de skills persiste na página até Salvar, sem reverter no blur.
- Garantir que `EditableTextField` (ou seu uso aqui) não descarte o draft ao
  perder foco quando há um contêiner de save global ativo.
- Nenhuma mudança na action (`action:updateProjectDefaults`) nem no parse CSV
  (`csvList`).

## Requirements

- Editar `skills`/`stageSkills` em Defaults e tirar o foco **não** perde o
  valor.
- O valor só é persistido ao Salvar (padrão VR-08); antes disso a página fica
  dirty.
- A tab Skills (catálogo) permanece read-only e inalterada.

## Arquivos afetados

- `src/web/client/pages/ConfigPage.tsx` (`DefaultsTab`).
- Possível ajuste em `components/core/EditableTextField.tsx`/`EditableFieldShell.tsx`
  (comportamento de blur sob save global).
- `tests/web/config-page.test.tsx` — blur não reverte; save persiste.

## Success Criteria

- **SC-001**: alterar skills em Defaults, clicar fora e o valor permanece na
  tela (página dirty).
- **SC-002**: Salvar persiste via `action:updateProjectDefaults`; recarregar
  reflete o novo valor.
- **SC-003**: a tab Skills continua apenas listando o catálogo.
