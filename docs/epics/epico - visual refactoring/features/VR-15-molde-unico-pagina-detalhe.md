# Feature Specification: Molde único de página de detalhe (título+ações / search / descrição)

**Feature Branch**: `feat/vr15-molde-unico-pagina-detalhe`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M4 (Tema B)
**Depende de**: —

## Objetivo

Fazer Projects, Epics e Work Item Details seguirem o mesmo molde do `plan.md`:
título com ações no canto superior direito → **Search** → **Descrição** →
conteúdo. Hoje cada página posiciona esses elementos de um jeito.

## Contexto de execução

O primitivo já existe e quase resolve — o problema é uso inconsistente:

- `PageHeader.tsx` expõe os slots `title`, `description`, `breadcrumb`,
  `actions`, `filters`. A ordem de render atual é: breadcrumb → título+actions →
  **description** (`:51`) → **filters** (`:55`). Ou seja, a descrição vem
  **antes** do search — invertido em relação ao molde-alvo (search antes da
  descrição).
- `ProjectDetailPage.tsx` usa `description={project.description}` via slot
  (`:108`) — referência correta de uso do slot, mas na ordem atual do header.
- `EpicDetailPage.tsx` **não** usa o slot: renderiza `epic.description` como
  `<p style={muted}>` dentro de um `Card` do `<main>` (`:209`) — fora do molde.

O que **falta**: (1) decidir e aplicar a ordem do molde no `PageHeader`
(search/filters acima da descrição, ou um slot `description` posicionado após
`filters`); (2) migrar `EpicDetailPage` e `BacklogItemDetail` para usar o slot
`description` do header em vez de markup próprio.

## Modelo técnico

- `PageHeader`: reposicionar o slot `description` para **depois** de `filters`
  (search), casando o molde `título+ações → search → descrição`; manter
  compatibilidade com quem já passa `description`.
- `EpicDetailPage`: remover o `<p>` manual (`:209`) e passar `description={epic.
  description}` ao header (liga com VR-16, que trata markdown).
- `BacklogItemDetail`: alinhar o header ao mesmo molde.

## Requirements

- As três páginas de detalhe posicionam título+ações, search e descrição na
  mesma ordem.
- A descrição vem de um único slot (`PageHeader.description`), sem markup
  ad-hoc por página.
- Nenhuma regressão de breadcrumb/filtros existentes.

## Arquivos afetados

- `src/web/client/PageHeader.tsx` (ordem do slot description).
- `src/web/client/pages/ProjectDetailPage.tsx`, `EpicDetailPage.tsx`,
  `BacklogItemDetail.tsx`.
- `tests/web/` — ordem dos elementos no header das três páginas.

## Success Criteria

- **SC-001**: Projects, Epics e Work Item Details renderizam título+ações →
  search → descrição na mesma ordem.
- **SC-002**: a descrição das três vem do slot do `PageHeader`, sem `<p>`
  ad-hoc.
- **SC-003**: breadcrumbs e filtros continuam funcionando.
