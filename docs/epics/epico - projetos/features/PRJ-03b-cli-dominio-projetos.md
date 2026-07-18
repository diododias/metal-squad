# Feature Specification: CLI e application services do domínio de Projects

**Feature Branch**: `feat/prj03b-cli-dominio-projetos`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M2
**Depende de**: PRJ-03

## Objetivo

Garantir que o domínio de Project/Epic/repo tenha **um único ponto de entrada de
caso de uso**, consumido igualmente por CLI e WebSocket. Sem esta camada, cada
handler WS reimplementaria orquestração (resolver path→repo, normalizar input,
montar resultado com `revision`) e as regras divergiriam. Este item entrega essa
camada e a expõe via CLI headless — sem subir o web server.

## Contexto de execução

Dois pontos de apoio já existem no código e devem ser reusados.

**CLI (Commander).** Os comandos são registrados por funções `register*(program)`
em `src/commands/`, montadas no bootstrap do CLI (`src/cli.ts` / `src/index.ts`).
O padrão canônico está em `registerBacklog(program)` (`src/commands/backlog.ts:15`):
`program.command('backlog').command('load').action(async (opts) => …)`. O comando
só lê `opts`/args e delega; nenhuma regra vive ali.

**API de domínio (de PRJ-03).** PRJ-03 entrega, em `src/db/repo.ts`, as queries e
services transacionais que este item orquestra: `createProject`, `getProject`,
`listProjects`, `updateProject(…, expectedRevision)`, `listProjectRepos`,
`linkRepo`, `moveRepo`, `unlinkRepo`, mais os erros codificados em
`src/db/errors.ts` (`PROJECT_NOT_FOUND`, `REPO_ALREADY_LINKED`, `REPO_IN_USE`,
`REVISION_CONFLICT`). Toda mutação já grava `audit_events` na mesma transação — o
application service **não** duplica esse audit.

O que **não** existe hoje e nasce aqui: a camada de *application service*
(caso de uso) que fica **acima** das queries de PRJ-03 e é chamada tanto pela CLI
quanto pelos handlers WS de PRJ-05/06/11. Ela resolve o que é mais que uma query
única — por exemplo, `path → RepoIdentity` (via `resolveRepo`, `src/core/repo.ts:12`)
antes de `linkRepo`, normalização de patch allowlisted, e a montagem do resultado
tipado `{ entity, revision }`. Para operações finas (1 query), o service apenas
repassa; a invariante é: **nenhum handler (CLI ou WS) contém SQL nem regra de
negócio**.

## Contrato da camada

**Application services** (novo módulo em `src/core/`), retornando resultado
tipado `{ entity, revision }` ou erro codificado:

- `projectService.create({ name, description? })`
- `projectService.update(projectId, patch, expectedRevision)`
- `projectService.list({ includeArchived?, includeDeleted? })` / `get(projectId)`
- `repoLinkService.link(projectId, { repoId | path })` — resolve path e delega a `linkRepo`
- `repoLinkService.move(repoId, toProjectId)` / `unlink(repoId)`
- `epicService.create({ projectId, title, description? })` / `update(epicId, patch, expectedRevision)`

**CLI** (delegando aos services acima):

- `msq projects list|create|update`
- `msq projects repos link|move|unlink`
- `msq epics list|create|update`
- Todas as leituras aceitam `--format json` com saída estável.

## Requirements

- Criar a camada de application services (caso de uso) para Project, Epic e
  vínculo/movimento de repo, acima das queries de PRJ-03.
- Expor `msq projects …` e `msq epics …` via `register*(program)`; o comando só
  valida/parseia args e delega. SQL em `src/db/`, regra em core/service.
- Toda mutação retorna resultado tipado com `entity` + `revision`; o audit event
  é gravado pela query de PRJ-03 (não reemitir na camada de service).
- Erros de domínio propagam com `code` estável (não `DbAccessError`).
- `--format json` produz saída estável e parseável para automação.
- Archive/delete não entram neste item; pertencem a PRJ-17.
- Testes provam paridade de resultado entre CLI e chamada direta do service.

## Arquivos afetados

- `src/core/projectService.ts` / `epicService.ts` (novos) — camada de caso de uso;
  ponto único chamado por CLI e WS.
- `src/commands/projects.ts` e `src/commands/epics.ts` (novos) — comandos Commander;
  registro no bootstrap (`src/cli.ts` / `src/index.ts`).
- `src/db/repo.ts` — reuso das queries/services de PRJ-03 (sem nova regra).
- `tests/commands/commands.test.ts` — comandos, `--format json` e paridade CLI×service.

## Success Criteria

- Um Project e um Epic podem ser criados sem iniciar o web server.
- Saída JSON é estável e utilizável por automação.
- Nenhuma regra de domínio é duplicada entre CLI e WS — ambos chamam o mesmo service.
- Erro de domínio (ex.: `REVISION_CONFLICT`) chega ao CLI com `code` estável.
