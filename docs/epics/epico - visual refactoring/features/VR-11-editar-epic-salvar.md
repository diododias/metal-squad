# Feature Specification: Edição de Epic passa a salvar sob o padrão global

**Feature Branch**: `feat/vr11-editar-epic-salvar`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M2 (Tema D)
**Depende de**: VR-08

## Objetivo

Fazer a edição de Epic salvar de forma previsível, sob o mesmo padrão de save
global (VR-08). O `plan.md` registra que hoje "editar epico não deixa salvar".

## Contexto de execução

- A edição vive em `pages/EpicEditor.tsx` (modal/editor com `title`,
  `description`, `status`, `position`) e despacha `action:updateEpic`
  (`web/types.ts:586`: `{ title?, description?, status?, position? }`). O `status`
  hoje é editável manualmente (`:25`) — com VR-05 ele passa a ser majoritariamente
  derivado; o editor mantém `title`/`description`/`position`.
- `PF-06` (épico Projetos-Front) já previu o `EpicEditor` em modal; aqui o foco
  é o **save funcionar** e seguir o dirty-state/guard de M2.

O que **falta**: aplicar `isDirty` + botão Salvar único + guarda de saída
(VR-09) ao editor de Epic, e garantir que o commit (`action:updateEpic`) reflita
sem reload e trate erro de servidor com mensagem real (padrão de toasts do
projeto).

## Modelo técnico

- `EpicEditor` adota `usePageDirtyState` (VR-08): Salvar único, habilitado só
  com alteração válida; erro do servidor exibido no editor (não genérico).
- Guarda de saída (VR-09) ao fechar o modal com pendências.
- Com VR-05 ativo, remover a edição livre de `status` do formulário (a
  aprovação é VR-06); manter `title`/`description`/`position`.

## Requirements

- Editar um Epic e Salvar persiste via `action:updateEpic`, refletindo sem
  reload.
- Botão Salvar respeita dirty-state; fechar com pendências pede confirmação.
- Erro de servidor aparece com a mensagem real.

## Arquivos afetados

- `src/web/client/pages/EpicEditor.tsx`.
- `tests/web/` — save persiste; dirty/guard; erro real.

## Success Criteria

- **SC-001**: editar título/descrição de um Epic e Salvar persiste e reflete na
  lista sem reload.
- **SC-002**: fechar o editor com alterações pendentes abre o modal de descarte.
- **SC-003**: um erro de servidor no save mostra a mensagem real, não texto
  genérico.
