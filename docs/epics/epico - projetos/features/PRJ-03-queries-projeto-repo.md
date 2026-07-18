# Feature Specification: Queries e services de Project/Repository

**Feature Branch**: `feat/prj03-queries-projeto-repo`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M1
**Depende de**: PRJ-01, PRJ-02

## Objetivo

Criar uma **API de domínio transacional** para Project e vínculo de repos,
reutilizada por CLI (M2) e WS (M2). Handlers não podem conter SQL nem replicar
regras de negócio — toda a lógica vive nessa camada de queries/services.

## Contexto de execução

As queries do produto vivem em `src/db/repo.ts` (arquivo grande, ~2k linhas). O
padrão a seguir já está estabelecido ali:

- Leitura: `getDb('readonly').prepare(...).get()/.all()` retornando linhas
  tipadas (ex.: `registerRepo` em `src/db/repo.ts:23`, leituras em `:73-84`).
- Escrita transacional: `withTransaction((database) => { ... })`
  (`src/db/repo.ts:99`), importado de `src/db/index.ts:104`. Escritas usam
  `getDb('readwrite')`. **Não** chamar `assertWritableDbPath` redundantemente
  dentro dessa fronteira — `getDb` já valida (`src/db/index.ts:81`).

Estruturas consumidas (criadas em PRJ-01/PRJ-02): `projects`, `project_repos`,
`audit_events`, e as colunas `revision`/`project_id`. Hoje **não existe**
`revision`, `expectedRevision`, `RevisionConflictError` nem escrita em
`audit_events` no código — tudo é novo neste épico.

Erros: hoje só há `DbAccessError` (`src/db/index.ts:9`, restrito a acesso SQLite)
e `BacklogCatalogNotFoundError` (`src/db/backlogCatalog.ts:23`). Criar um módulo
de erros de domínio **codificados** (ex.: `src/db/errors.ts` ou `src/core/errors.ts`)
com `code` estável, distinto de `DbAccessError`.

Referência de transferência segura: a lógica de "repo em uso" deve checar Work
Items vinculados via `backlog_features` (`src/db/index.ts:328`, coluna `repo_id`)
antes de permitir `moveRepo`/`unlinkRepo`.

## Contrato da API

**Queries tipadas** (`src/db/repo.ts`):

- `createProject(input)` → cria Project (UUID v4, `revision=1`) + audit.
- `getProject(projectId, { includeArchived?, includeDeleted? })`.
- `listProjects({ includeArchived?, includeDeleted? })` ordenado por `position`.
- `updateProject(projectId, patch, expectedRevision)` → incrementa `revision`.
- `listProjectRepos(projectId)` → repos vinculados ordenados por `position`.

**Services** (mesma camada):

- `linkRepo(projectId, repoId)` — vincula repo livre; **nunca** sobrescreve.
- `moveRepo(repoId, toProjectId)` — transferência atômica.
- `unlinkRepo(repoId)` — desvincula; Project pode ficar sem repo.
- Consultas agregadas de contagem (repos/epics/work items por Project).

## Requirements

- `updateProject` recebe `expectedRevision`; divergência gera
  `RevisionConflictError` (código `REVISION_CONFLICT`).
- Repo já vinculado exige `moveRepo`; `linkRepo` num repo ocupado gera
  `REPO_ALREADY_LINKED`, nunca overwrite silencioso.
- `moveRepo` é atômico e permitido **apenas** quando o repo não possui Work Item
  ativo ou arquivado vinculado ao Project atual. Histórico de runs preserva o
  `project_id` snapshot (colunas de PRJ-01), então transferir não reclassifica
  runs antigas.
- `unlinkRepo` é permitido apenas quando o repo não possui Work Item vinculado
  (`REPO_IN_USE` caso contrário).
- Erros de negócio têm código estável: `PROJECT_NOT_FOUND`, `REPO_ALREADY_LINKED`,
  `REPO_IN_USE`, `REVISION_CONFLICT`. `DbAccessError` continua restrito a acesso
  ao SQLite.
- **Toda mutação** grava um `audit_events` na **mesma transação** (ator, sessão,
  entidade, operação, before/after, timestamp). Falha após o update e antes do
  audit desfaz a operação inteira.

## Arquivos afetados

- `src/db/repo.ts` — queries de Project e services de vínculo; helper de escrita
  de audit event reutilizável.
- `src/db/errors.ts` (novo) ou `src/core/errors.ts` — erros de domínio com `code`.
- `src/db/index.ts` — se necessário, expor helper de audit no nível de transação.
- `tests/db/repo.test.ts` — cobertura de queries, services e erros codificados.
- `tests/db/index.test.ts` — integração transação + audit.

## Success Criteria

- Duas tentativas concorrentes de vincular o mesmo repo resultam em uma vitória e
  um `REPO_ALREADY_LINKED` tipado.
- Transferência não reclassifica runs antigas (mantêm o snapshot de Project).
- Falha injetada após o update e antes do audit event desfaz toda a operação.
- Testes cobrem `includeArchived`/`includeDeleted`, ordenação por `position` e
  conflito de `revision`.
