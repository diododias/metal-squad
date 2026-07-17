# Feature Specification: Catálogo agregado e consultas por Project

**Feature Branch**: `feat/prj15-project-catalog-scope`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M3
**Depende de**: PRJ-07, PRJ-14

## Objetivo

Construir uma projeção global consultável por Project/Epic/Repository **sem
depender do cwd** do web server: um único filtro de Project deve recortar Board,
Runs, Gates e Analytics de forma consistente. O roteamento de execução (qual
`cwd` cada run usa) fica isolado em PRJ-15B; este item entrega apenas as
**consultas de leitura**.

## Contexto de execução

O catálogo atual é **single-repo e chaveado por um cwd único**. `getFeatureCatalog`
(`src/ui/catalog.ts:165`) resolve **um** repo via `resolveRepo(cwd)`
(`src/ui/catalog.ts:114`) e carrega `loadBacklogFromCatalog(repoId, cwd)`. Note que
`loadBacklogFromCatalog(repoId, _cwd)` (`src/core/backlog/load.ts:234`) já **ignora**
o cwd (parâmetro `_cwd`) e opera puramente por `repoId` — bom ponto de partida
para agregar por Project.

Todas as queries de catálogo são `WHERE repo_id = ?`:
`listCatalogEpics` (`src/db/backlogCatalog.ts:122`), `listCatalogFeatures`
(`:134`), `getCatalogFeature` (`:158`), `listCatalogTasks` (`:170`),
`listCatalogFeaturesJoined` (`:308`). A mudança central deste item é permitir
**recorte por `projectId`** (que expande para o conjunto de `repo_id` vinculados
via `project_repos`) mantendo o path por-repo intacto.

O estado que consome essas queries é `buildMsqWebState`
(`src/web/state.ts:261-306`): hoje monta `featureCatalog`, `pendingFeatures`,
`runs`, `gates` a partir de **um** repo. Com PRJ-07 o state já carrega
`projects[]`/`repositories[]`; aqui a projeção de itens passa a resolver
WorkItem→repo e WorkItem→Epic→Project de forma explícita.

Runs/pipelines: as colunas `project_id` snapshot em `runs`/`pipelines` (criadas
nullable em PRJ-01) são a fonte para histórico — transferir um repo entre Projects
**não** deve reclassificar runs antigas. Itens novos usam o Project atual do Work
Item; itens históricos usam o snapshot.

Custo: consultas agregadas não podem virar N+1 nem ler filesystem por item.
Precisam de índices por Project/repo/epic/lifecycle (definidos em PRJ-01) e planos
verificados em fixture de volume. As fixtures determinísticas seguem
`harness.md`/`src/db/fixtures.ts` (sandbox `MSQ_DB_PATH`, nunca banco global).

Integridade: se um Work Item não resolve exatamente um repo e um Project (ex.:
repo desvinculado, epic órfão), o resultado é um `integrityIssue` explícito — nunca
"último projeto conhecido" nem string vazia.

## Contrato técnico (queries agregadas)

Novas queries de catálogo por Project (camada `src/db/`), com filtros explícitos:

```ts
listWorkItemsByScope({
  projectId?, epicId?, repoId?,
  lifecycle: 'active' | 'archived' | 'deleted',
  limit?, offset?,
}): WorkItemCatalogEntry[]        // resolve repo, Epic e Project por item

countByScope({ projectId }): {
  epics, workItems, activeRuns, ...
}

resolveScopeRepos(projectId): string[]   // projectId → repo_ids (project_repos)
```

Cada `WorkItemCatalogEntry` (alias de `FeatureCatalogEntry`,
`src/ui/catalog.ts:13`) carrega `projectId`, `repoId`, `epicId`, `repoLabel` e
`workItemType`. Board/Runs/Gates/Analytics recebem o **mesmo** predicado de
Project para garantir conjuntos idênticos. Estado ativo e
arquivados/deletados são projeções distintas (consultas separadas, não flags
misturadas no caminho quente).

## Requirements

- Queries aceitam `projectId`, `epicId`, `repoId`, lifecycle e paginação explícitos.
- Catálogo resolve WorkItem→repo e WorkItem→Epic→Project; divergência entre relações é erro de integridade, nunca "último projeto conhecido".
- Runs/pipelines usam `project_id` snapshot para histórico; itens novos usam Project atual do Work Item.
- Board, Runs, Gates e Analytics podem ser recortados pelo mesmo filtro de Project (mesmo predicado).
- Stage requests/gates sem repo/project resolvível aparecem como `integrityIssue`, não com string vazia.
- Consultas agregadas evitam N+1 e têm índices/planos verificados em fixture de volume.
- Estado ativo e arquivados/deletados são projeções distintas.

## Arquivos afetados

- `src/db/backlogCatalog.ts` — novas queries por escopo de Project (expandindo o
  padrão `WHERE repo_id = ?` de `:122-186` para `repo_id IN (...)` derivado de
  `project_repos`); contagens agregadas; projeções ativo/arquivado/deletado.
- `src/ui/catalog.ts` — `getFeatureCatalog` (`:165`) passa a aceitar escopo por
  Project; entradas resolvem `projectId`/`repoId`/`epicId`.
- `src/web/state.ts` — `buildMsqWebState` (`:261`) monta o catálogo por escopo em
  vez de por cwd único.
- `src/db/index.ts` — índices por Project/repo/epic/lifecycle (se não cobertos em
  PRJ-01).
- `tests/db/backlogCatalog.test.ts` + fixture de volume — paginação, N+1,
  integridade e igualdade de conjunto entre Board/Runs/Gates/Analytics.

## Success Criteria

- Todo item ativo resolve exatamente um Project, Epic e repo.
- Transferir repo vazio não reclassifica runs históricas.
- Filtro de Project produz o mesmo conjunto em Board/Runs/Gates/Analytics.
- Teste de volume prova paginação e ausência de leitura de filesystem.
