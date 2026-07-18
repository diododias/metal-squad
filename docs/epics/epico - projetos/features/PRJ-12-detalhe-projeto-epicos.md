# Feature Specification: Detalhe do Project — Epics e Work Items

**Feature Branch**: `feat/prj12-project-detail`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M4
**Depende de**: PRJ-08, PRJ-11, PRJ-14, PRJ-15

## Objetivo

Entregar a tela de **detalhe de um Project**: resumo, repos vinculados, Epics com
status manual e progresso, e os Work Items agrupados por Epic (com repo, tipo,
workflow e dependências visíveis). É onde o usuário cria Epics e Work Items no
contexto do Project, reusando os services já existentes.

## Contexto de execução

Depende de três peças já entregues no épico: a rota/página `/projects` (PRJ-08,
`src/web/client/lib/routes.ts` + `App.tsx:122`), as ações de Epic (PRJ-11:
`action:createEpic`/`updateEpic`), a criação de Work Item com repo alvo (PRJ-14:
`action:createWorkItem`) e o catálogo agregado por Project (PRJ-15:
`listWorkItemsByScope({ projectId, epicId })`).

Adicionar o detalhe exige uma rota parametrizada por id — hoje o roteamento é
hash-based e enumerado (`src/web/client/lib/routes.ts:1-19`); o padrão a seguir é
o de `run-detail`/`backlog-detail`, que já extraem um id do hash
(`h.startsWith('/runs/')`, `:12-13`). Ex.: `{ page: 'project-detail'; projectId }`
com `h.startsWith('/projects/')`.

Dados vêm do state (WS push): `state.projects` (PRJ-07, `ProjectSummary`) para o
resumo/counts, `RepositorySummary[]` para os repos, e o catálogo por escopo
(PRJ-15) para Epics/Work Items. O detalhe **não** deve embutir specs/transcripts
completos no `state:full` — Work Items são carregados com paginação/lazy load,
mesma disciplina de custo por tick de PRJ-07/PRJ-15.

Reuso de forms/services: criar Epic e Work Item usa **as mesmas** ações WS de
PRJ-11/PRJ-14 e os mesmos primitivos de edição (`EditableTextField`, `Card`,
`Button` em `src/web/client/components/core/`) — sem duplicar formulário ou
lógica. Status manual do Epic (`todo|in_progress|done`) é distinto do progresso
derivado dos Work Items (que vem do status de execução das runs); os dois são
mostrados separadamente (edição do status é PRJ-13).

Project sem repo: o form de Epic funciona, mas o form de Work Item fica bloqueado
com explicação (Work Item exige um repo alvo vinculado — PRJ-14 recusa
`repoId ∉ project_repos`).

Archive/delete de itens só aparece após PRJ-18.

## Modelo técnico

- Rota: `| { page: 'project-detail'; projectId: string }` + ramo em `parseHash`.
- `ProjectDetailPage({ state, send, projectId })`:
  - header: resumo do `ProjectSummary` + `RepositoriesSection` (PRJ-09).
  - lista de Epics: status manual, descrição, progresso derivado, counts por repo.
  - sob cada Epic: Work Items paginados (`workItemType`, status derivado, repo
    label, workflow resumido, `dependsOn`).
  - CTAs: criar Epic (`action:createEpic`), criar Work Item (`action:createWorkItem`).

## Requirements

- Rota/detalhe de Project com resumo, repos, Epics e Work Items agrupados.
- Epic exibe status manual, descrição, progresso derivado dos Work Items e contagens por repo.
- Work Item exibe type, status derivado, repo, workflow resumido e dependências.
- Permitir criar Epic e Work Item a partir do contexto, sem duplicar forms/services.
- Paginação/lazy load para Work Items; não colocar specs/transcripts completos em `state:full`.
- Archive/delete só aparecem após PRJ-18.

## Arquivos afetados

- `src/web/client/lib/routes.ts` — rota `project-detail` + `parseHash`.
- `src/web/client/App.tsx` — render da rota (`:166+`).
- `src/web/client/pages/ProjectDetailPage.tsx` (novo) — resumo, Epics, Work Items.
- `src/web/client/components/core/*` — reuso de campos/cards; forms de Epic/Work Item.
- `src/web/types.ts` — reuso de `createEpic`/`createWorkItem` (PRJ-11/PRJ-14).
- `tests/web/*` — agrupamento, paginação, Project vazio, relações inconsistentes.

## Success Criteria

- Epic multi-repo mostra corretamente Work Items de repos distintos.
- Project sem repo permite Epic, mas form de Work Item explica por que está bloqueado.
- Testes cobrem agrupamento, paginação, Project vazio e relações inconsistentes.
