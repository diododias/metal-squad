# Feature Specification: Backfill e reconstrução — Project implícito por repo

**Feature Branch**: `feat/prj02-backfill-projeto-implicito`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M1
**Depende de**: PRJ-01

## Objetivo

Migrar todos os repos registrados, inclusive vazios, para um **Project implícito**
(um Project por repo existente) e concluir a mudança de Epic repo-level para Epic
project-level sem perder histórico. É o **passo 2 de 2** da migração: consome as
estruturas nullable criadas em PRJ-01, preenche os vínculos e **reconstrói**
`backlog_epics` para tornar `project_id NOT NULL` e `repo_id` legado.

## Contexto de execução

Hoje `backlog_epics.repo_id` é `NOT NULL REFERENCES repos(repo_id)`
(`src/db/index.ts:318-326`) — cada Epic pertence a um repo. O alvo é: Epic
pertence ao Project; `repo_id` vira nullable/legado. **SQLite não altera constraint
(`NOT NULL`) via `ALTER TABLE`**, então a reconstrução usa o padrão canônico
`create-copy-drop-rename` dentro de uma transação com `foreign_keys` desligado só
durante o swap:

1. `PRAGMA foreign_keys=OFF` (dentro da transação de rebuild);
2. `CREATE TABLE backlog_epics_new (... project_id TEXT NOT NULL, repo_id TEXT
   NULL ...)` preservando as demais colunas e defaults;
3. `INSERT INTO backlog_epics_new SELECT ...` copiando PK, `data_json`, `position`,
   `title`, timestamps e `archived_at`;
4. `DROP TABLE backlog_epics`; `ALTER TABLE backlog_epics_new RENAME TO
   backlog_epics`; recriar índices;
5. `PRAGMA foreign_key_check` antes do commit; reativar `foreign_keys=ON`.

Fontes de dados para o backfill:

- `repos` (`src/db/index.ts:111`) — lista completa de repos, inclusive vazios.
- `project_repos` (criada em PRJ-01) — vínculo repo→Project.
- `backlog_catalog_meta.repo` (`src/db/index.ts:309-316`, coluna `repo`) — nome
  amigável do repo, primeira escolha para nomear o Project implícito.
- Fallback de nome: `basename(path)` do repo; `resolveRepo()` em
  `src/core/repo.ts:12` resolve o `path` a partir do `cwd`/git.
- Snapshots: `runs.project_id` / `pipelines.project_id` (colunas nullable de
  PRJ-01) preenchidos pelo vínculo do `repo_id` da run/pipeline.

Onde escrever: a lógica de backfill deve rodar como etapa explícita (novo módulo
`src/db/backfill.ts` ou função dedicada chamada por `scripts/migrate-db.mjs`),
**não** dentro do `migrate()` convergente de PRJ-01 — backfill é operação de dados,
migrate é estrutura. Usar `withTransaction` (`src/db/index.ts:104`) e UUID v4 para
`project_id` (mesma convenção de identidade opaca da PRJ-01).

**Backup**: não existe utilitário de backup no repo hoje. Criar um verificável
antes de qualquer escrita — preferir `VACUUM INTO '<path>.bak'` (cópia consistente
sem lock) e validar o arquivo resultante com `PRAGMA integrity_check` antes de
prosseguir. O caminho do backup fica ao lado do DB resolvido por `resolveDbPath()`
(`src/config/index.ts`).

## Algoritmo transacional

1. Criar backup verificado do DB (`VACUUM INTO` + `integrity_check`).
2. Para cada linha de `repos`, localizar `project_repos.repo_id`.
3. Quando ausente, criar Project UUID v4 com nome derivado de
   `backlog_catalog_meta.repo` ou `basename(path)` e vincular o repo em
   `project_repos`.
4. Preencher `backlog_epics.project_id` pelo vínculo atual (via `repo_id`).
5. Preencher snapshots `runs.project_id`/`pipelines.project_id` pelo vínculo do
   repo daquela run/pipeline.
6. Reconstruir `backlog_epics` (`create-copy-drop-rename`) com `project_id NOT
   NULL` e `repo_id` nullable, preservando PK, JSON, posições, timestamps e
   archive.
7. `PRAGMA foreign_key_check` + `PRAGMA integrity_check` e só então commit.

## Edge cases fechados

- Repo sem Epic também recebe Project implícito (iterar `repos`, não `epics`).
- Epic com `repo_id` sem linha em `repos` **interrompe** a migração antes do
  commit, com relatório do Epic/repo órfão; não é silenciosamente ignorado.
- Reexecução detecta vínculos existentes em `project_repos` e não cria novos
  Projects (idempotência).
- Nome de Project duplicado é permitido; identidade é UUID.
- `status` legado do Epic assume `todo`; isso não altera o status derivado de
  features/runs.

## Arquivos afetados

- `src/db/backfill.ts` (novo) — algoritmo transacional, rebuild de
  `backlog_epics`, criação de Projects implícitos e snapshots.
- `src/db/index.ts` — utilitário de backup (`VACUUM INTO` + verificação); ajuste
  de índices de `backlog_epics` após rename.
- `scripts/migrate-db.mjs` — invocar o backfill após a migração estrutural.
- `src/config/index.ts` — reuso de `resolveDbPath()` para localizar o backup.
- `tests/db/` — backfill idempotente, rebuild preserva dados, backup restaurável.
- `tests/harness/` — garantir que roda em banco sandbox, nunca no global.

## Success Criteria

- Número de vínculos em `project_repos` == número de repos registrados.
- 100% dos Epics têm `project_id`; `repo_id` legado continua consultável, mas
  novos Epics gravam `NULL`.
- Runs e pipelines antigos possuem snapshot de `project_id`.
- Reexecução não muda IDs, contagens nem timestamps funcionais.
- Restore do backup reproduz o DB anterior byte a byte nas colunas existentes.
