# Feature Specification: Escopo web por Project e Kanban por Epic

**Feature Branch**: `feat/prj16-project-scope-web`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M4
**Depende de**: PRJ-10, PRJ-15, PRJ-15B

## Objetivo

Fazer Board, Runs, Gates e Analytics respeitarem o **Project ativo** (PRJ-10) e
adicionar ao Board um filtro por **Epic** e por **type**, mostrando o repo no card
quando o Project tem múltiplos repos. É o momento em que a seleção por cliente
passa a recortar de fato as quatro telas.

## Contexto de execução

O Board hoje é **single-repo e só filtra por `tool`**. `BoardPage`
(`src/web/client/pages/BoardPage.tsx:38`) tem `toolFilter` (`:40`), aplica `byTool`
(`:45`) e monta a coluna TODO a partir de `state.pendingFeatures` (`:49`) e as
colunas de execução a partir de `state.runs` (`:51-54`): `progress`
(running/blocked), `done`, `failed` (failed/aborted). Não há noção de Project nem
de Epic no filtro.

Os cards são `KanbanCard` (`src/web/client/components/data/KanbanCard.tsx:75`),
cuja `KanbanCardRun` (`:25-44`) carrega `epicTitle`, `status`, `tool`, `model`,
`effort` — mas **não** `repo` nem `type`. A "tool rail" (`:58-68`) é onde entram
células de ícone (tool/model/effort); repo/type/health entram como novas células
ou badges. Os dados novos vêm do catálogo enriquecido (PRJ-07/PRJ-15:
`projectId`, `repoId`, `repoLabel`, `workItemType`).

Escopo consistente: Board/Runs/Gates/Analytics devem aplicar o **mesmo** helper
seletor sobre o `activeProjectId` do `ActiveProjectContext` (PRJ-10) — e o recorte
real usa queries que aceitam Project explícito (PRJ-15), não só filtragem no
cliente (segurança/integridade). `Project null` **não** significa "mostrar tudo"
quando há Projects: mostra seleção obrigatória.

Rotas de detalhe (`run-detail`/`backlog-detail`, `routes.ts:12-13`) continuam
acessíveis por ID global, mas exibem Project/repo e oferecem retorno ao contexto.

## Modelo técnico

- `BoardPage` ganha `epicFilter` (`'all'` + Epics ativos do Project) e `typeFilter`
  (`all|feature|bug`), somados ao `toolFilter` existente (`:40`).
- Predicado combinado: `activeProjectId` (obrigatório quando há Projects) + Epic +
  tool + type, aplicado sobre o catálogo por escopo (PRJ-15).
- `KanbanCardRun` (`:25`) recebe `repoLabel?` e `workItemType?`; `KanbanCard`
  (`:75`) renderiza badge de type, célula de repo (só em Project multi-repo) e
  marca health impeditivo.
- Colunas de status **preservadas** (`:51-54`): TODO, IN PROGRESS/BLOCKED, DONE,
  FAILED/CANCELED.

## Requirements

- Board, Runs, Gates e Analytics aplicam `activeProjectId` pelo mesmo helper seletor.
- Board adiciona filtro de Epic (`todos` + Epics ativos do Project), mantendo tool e adicionando type.
- KanbanCard mostra repo em Project multi-repo, type e health impeditivo.
- Colunas preservam status derivado: TODO, IN PROGRESS/BLOCKED, DONE e FAILED/CANCELED.
- Rotas de detalhe continuam acessíveis por ID global, mas exibem Project/repo e oferecem retorno ao contexto correto.
- Project `null` não significa "mostrar tudo" quando existem Projects; mostra seleção obrigatória.
- Filtragem não depende apenas do cliente para autorização/integridade; queries aceitam Project explícito.

## Arquivos afetados

- `src/web/client/pages/BoardPage.tsx` — filtros de Epic/type (`:40-54`) e
  consumo do `ActiveProjectContext`.
- `src/web/client/components/data/KanbanCard.tsx` — `KanbanCardRun` (`:25`) +
  render de repo/type/health (`:58-68`).
- `src/web/client/pages/{RunsPage,GatesPage,AnalyticsPage}.tsx` — mesmo helper de
  escopo por Project.
- `src/web/client/lib/scope.ts` (novo) — helper seletor único.
- `src/db/backlogCatalog.ts` — queries que aceitam Project/Epic explícitos (PRJ-15).
- `tests/web/*` — filtros combinados, estados vazios, detalhes fora do filtro.

## Success Criteria

- Mesmo Project produz conjunto coerente nas quatro telas.
- Combinação Project+Epic+tool+type é determinística e preservada durante navegação.
- Card de repo unhealthy não inicia run e explica o motivo.
- Testes de componentes cobrem filtros combinados, estados vazios e detalhes fora do filtro.
