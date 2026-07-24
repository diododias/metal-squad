# Feature Specification: Breadcrumbs completos `Projeto › Epic › Work Item` na Run Detail

**Feature Branch**: `feat/vr17-breadcrumbs-completos-run-detail`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M4 (Tema B)
**Depende de**: —

## Objetivo

A Run Detail deve mostrar a trilha completa `Projeto › Epic › Work Item` no
breadcrumb, em vez do atual link solto "Runs". Contextualiza a run na hierarquia
e casa com o molde do épico Projetos-Front (PF-14).

## Contexto de execução

- `RunDetailPage.tsx` hoje usa um breadcrumb mínimo: `<a href="#/runs">Runs</a>`
  (`:184`, `:359`), com um `returnToItemContext()` que só reativa o
  `activeProjectId` (`:145`).
- Os dados da hierarquia já estão disponíveis no componente: `feature =
  state.featureCatalog[featureId]` traz `projectId` (`itemProjectId`, `:143`);
  `projects.find(...).name` dá o nome do projeto (`projectName`, `:144`). Falta o
  Epic — checar se `feature.epicId`/`epicTitle` estão no catálogo (o `KanbanCard`
  já consome `epicTitle`, então o dado existe no state).
- `PageHeader` aceita `breadcrumb` como `BreadcrumbItem[]` (trail com
  `label`/`href`), já usado por `ProjectDetailPage`/`EpicDetailPage`.

O que **falta**: montar o trail `Projects › {Projeto} › {Epic} › {Work Item}`
com hrefs corretos (restaurando `activeProject` ao navegar, como já faz
`returnToItemContext`).

## Modelo técnico

- `RunDetailPage`: substituir o breadcrumb solto por
  `breadcrumb={[{ label: 'Projects', href: '/projects' }, { label: projectName,
  href: `/projects/${projectId}` }, { label: epicTitle, href: epicPath },
  { label: workItemTitle }]}`, reusando `hashWithRestoredQuery`/`returnToItemContext`.
- Se `epicId`/`epicTitle` não estiverem no `featureCatalog`, ampliar o snapshot
  (pequeno) para incluí-los — mesma origem que alimenta o `epicTitle` do card.

## Requirements

- A Run Detail exibe `Projects › Projeto › Epic › Work Item` com navegação
  funcional em cada nível.
- Navegar por um nível restaura o `activeProject` correto (sem quebrar contexto).
- Fallback gracioso quando algum nível não resolve (ex.: run órfã).

## Arquivos afetados

- `src/web/client/pages/RunDetailPage.tsx`.
- Possível ajuste no snapshot/`featureCatalog` para `epicId`/`epicTitle`.
- `tests/web/run-detail-page.test.tsx` — trilha completa e navegação.

## Success Criteria

- **SC-001**: a Run Detail mostra a trilha completa dos quatro níveis.
- **SC-002**: clicar em cada nível navega e restaura o projeto ativo.
- **SC-003**: run sem Epic/Projeto resolvível degrada sem quebrar o header.
