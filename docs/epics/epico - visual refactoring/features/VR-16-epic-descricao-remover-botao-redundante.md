# Feature Specification: Epic exibe descrição (markdown) e some o botão "novo" redundante

**Feature Branch**: `feat/vr16-epic-descricao-remover-botao-redundante`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M4 (Tema B)
**Depende de**: VR-15

## Objetivo

Duas correções do `plan.md` ligadas ao molde de detalhe: (1) o Epic passa a
exibir sua descrição (renderizada como markdown, consistente com a Spec);
(2) remover o botão "Novo Epic"/"Novo work item" redundante no meio da lista —
criação só no topo.

## Contexto de execução

- Descrição do Epic: hoje renderizada como `<p style={muted}>{epic.description}</p>`
  em `EpicDetailPage.tsx:209` (texto cru). Com VR-15 ela vai para o slot do
  header; aqui ela passa a usar `MarkdownView` (o renderer já existe:
  `components/MarkdownView.tsx`, react-markdown + remark-gfm + rehype-highlight).
- Botão redundante: `ProjectDetailPage.tsx` tem `+ New Epic` no topo (`:135`) e
  **de novo** no meio/rodapé da lista (`:168`). O `plan.md` pede só no topo.
  Conferir também `EpicDetailPage` para duplicações equivalentes.

## Modelo técnico

- `EpicDetailPage`: descrição via `MarkdownView` no slot `description` do header
  (VR-15). Descrições curtas continuam legíveis; markdown é renderizado.
- `ProjectDetailPage`: remover o segundo `+ New Epic` (`:168`), mantendo o do
  topo (`:135`). Preservar o estado do modal (`setShowCreateEpic`).

## Requirements

- O Epic exibe sua descrição renderizada como markdown.
- A criação (Novo Epic/Work Item) aparece só no topo; nenhuma duplicata no meio
  da lista.
- Sem regressão nos modais de criação.

## Arquivos afetados

- `src/web/client/pages/EpicDetailPage.tsx` (descrição markdown),
  `pages/ProjectDetailPage.tsx` (remove botão duplicado).
- `tests/web/` — descrição do Epic presente; único botão de criação.

## Success Criteria

- **SC-001**: o detalhe do Epic exibe a descrição (markdown renderizado).
- **SC-002**: só há um botão de criação por página (no topo).
- **SC-003**: os modais de criação continuam abrindo normalmente.
