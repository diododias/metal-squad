# Feature Specification: Página `/projects`

**Feature Branch**: `feat/prj08-projects-page`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M4
**Depende de**: PRJ-05, PRJ-07, PRJ-10

## Objetivo

Entregar a primeira tela dedicada a **Projects**: uma rota `/projects` que lista
os Projects ativos com seus resumos e permite criar/editar nome e descrição. É a
porta de entrada da gestão multi-projeto na web; archive/delete ficam para
PRJ-17/18 e o detalhe do Project (Epics/Work Items) é PRJ-12.

## Contexto de execução

O roteamento do client é **hash-based e enumerado à mão**: `Route` é um union
fechado e `parseHash` mapeia hashes conhecidos (`src/web/client/lib/routes.ts:1-19`).
Hoje **não existe** `/projects` — as páginas são `board`, `runs`, `run-detail`,
`backlog-detail`, `gates`, `analytics`, `config`. Adicionar a rota exige: novo
membro no union `Route`, novo ramo em `parseHash` e um novo item em `navItems`
(`src/web/client/App.tsx:122-127`, hoje Board/Runs/Gates/Analytics/Settings),
renderizado pela `Sidebar` (`src/web/client/components/navigation/Sidebar.tsx:77`
usa `href={#${item.path}}`; `:102` o label). O render por rota é a cadeia de
`if (route.page === ...)` em `App.tsx:166+`.

Dados: o estado vem por WS state-push. `MsqWebState` já carrega `projects[]`
(PRJ-07, `ProjectSummary` com counts/runs/tokens/revision). A página consome esse
array — **não** faz fetch REST. Criação/edição usam as ações `action:createProject`
/ `action:updateProject` (PRJ-05), enviadas via `send` do hook `useWebSocket`
(`src/web/client/App.tsx:100`). Toda edição carrega `expectedRevision` (detecção
de concorrência, requisito transversal do ROADMAP) e correlaciona resposta por
`requestId`.

Primitivos de UI reusáveis já existem: `EditableTextField`
(`src/web/client/components/core/EditableTextField.tsx`), `Card`, `Button`,
`StatusPill`, e o padrão de página com header/filtros do `BoardPage`
(`src/web/client/pages/BoardPage.tsx:58-92`). Estados loading/empty/error seguem
o que as páginas atuais já praticam.

Seleção de Project ativo é **por cliente** (PRJ-10), persistida em localStorage —
esta página não deve empurrar seleção ao servidor nem tratar `activeProjectId`
como estado global.

## Modelo técnico

- `Route`: adicionar `| { page: 'projects' }` (e futura `project-detail` em PRJ-12).
- `parseHash`: `if (h === '/projects') return { page: 'projects' }`.
- `navItems`: `{ path: '/projects', label: 'Projects' }`.
- Novo `ProjectsPage({ state, send })` consumindo `state.projects` (`ProjectSummary[]`).
- Draft local de create/update com `expectedRevision` + `requestId`; em
  `REVISION_CONFLICT` o draft é preservado e o usuário recarrega/reaplica.

## Requirements

- Nova rota `/projects` com lista paginável de Projects ativos.
- Exibir nome, descrição, repos/Epics/Work Items, runs ativas, tokens recentes e health agregado.
- Permitir criar e editar nome/descrição usando `expectedRevision` e feedback correlacionado por `requestId`.
- Navegar para detalhe do Project e oferecer CTA claro em estado vazio.
- Archive/delete não entram antes de PRJ-17/18.
- Busca por nome e ordenação por posição/atividade.
- Layout desktop/mobile e estados loading/empty/error acessíveis.

## Arquivos afetados

- `src/web/client/lib/routes.ts` — novo membro `Route` + ramo em `parseHash`.
- `src/web/client/App.tsx` — `navItems` (`:122`), render por rota (`:166+`).
- `src/web/client/pages/ProjectsPage.tsx` (novo) — lista, create, update.
- `src/web/client/components/core/*` — reuso de `EditableTextField`, `Card`, `Button`.
- `src/web/types.ts` — reuso de `action:createProject`/`updateProject` (PRJ-05).
- `tests/web/*` — componente: lista, vazio, erro, create, update, concorrência.

## Success Criteria

- Create/update persistem e conflito de revision é recuperável sem perder o draft.
- Página não mistura seleção local com alteração global do servidor.
- Testes de componente cobrem lista, vazio, erro, create, update e concorrência; smoke manual é complementar.
