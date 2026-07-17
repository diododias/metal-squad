# Feature Specification: Migração de schema — Projects e identidade histórica

**Feature Branch**: `feat/prj01-migracao-schema-projeto`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M1
**Depende de**: PRJ-00

## Objetivo

Introduzir a entidade **Project** acima de Repository sem atribuir um repo
artificial ao Epic e sem reclassificar histórico quando um repo for transferido
no futuro. Este é o **passo 1 de 2**: cria estruturas novas e colunas nullable de
forma puramente aditiva, sem tocar em dados existentes. A reconstrução de
`backlog_epics` (tornar `project_id NOT NULL` e `repo_id` legado) e o backfill
ficam em PRJ-02.

## Contexto de execução

Toda a migração do produto vive numa única função idempotente `migrate(d)` em
`src/db/index.ts`. **Não existe tabela de versão de schema nem framework de
migração numerada**: o schema converge por reexecução. Dois padrões coexistem e
devem ser reusados:

1. **Tabela nova** → bloco `d.exec()` com `CREATE TABLE IF NOT EXISTS ...` no
   início de `migrate()` (`src/db/index.ts:110-431`). É onde entram `projects`,
   `project_repos` e `audit_events`.
2. **Coluna aditiva em tabela existente** → ler `PRAGMA table_info(<tabela>)` e
   aplicar `ALTER TABLE ADD COLUMN` condicional. Já existe o helper
   `ensureRunColumn`/`ensurePipelineColumn` (`src/db/index.ts:433-539`); siga o
   mesmo formato para `backlog_epics`, `backlog_features`, `runs` e `pipelines`.

Pontos de apoio no mesmo arquivo:

- `getDb(mode)` (`src/db/index.ts:64`) abre a conexão, chama
  `assertWritableDbPath` (`:26`), liga `PRAGMA foreign_keys = ON` (`:85`) e roda
  `migrate` (`:86`). O `foreign_keys=ON` já vale para migração e testes.
- `withTransaction(cb)` (`src/db/index.ts:104`) envelopa escritas numa transação.
- `DbAccessError` (`src/db/index.ts:9`) é o único erro de acesso ao SQLite; não
  reusar para erro de domínio.
- Tabelas existentes a estender: `backlog_epics` (`src/db/index.ts:318`),
  `backlog_features` (`:328`), `runs` (`:117`), `pipelines` (`:239`).

Schemas Zod do backlog em `src/core/backlog/schema.ts`: `EpicSchema` (`:187`),
`EpicInputSchema` (`:193`), `FeatureSchema` (`:144`), `FeatureInputSchema`
(`:168`). `Feature` já tem `spec` (`:147`) como especificação técnica; o novo
`description` é resumo funcional editável e é campo **separado** de `spec`.

Entrypoint de migração real: `scripts/migrate-db.mjs` (chama `getDb('readwrite')`;
schema converge na abertura). O `build` é puro e nunca migra (ver `harness.md`).

## Modelo alvo

```sql
CREATE TABLE projects (
  project_id   TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  archived_at  TEXT,
  deleted_at   TEXT,
  revision     INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (archived_at IS NULL OR deleted_at IS NULL)
);

CREATE TABLE project_repos (
  repo_id      TEXT PRIMARY KEY REFERENCES repos(repo_id) ON DELETE RESTRICT,
  project_id   TEXT NOT NULL REFERENCES projects(project_id) ON DELETE RESTRICT,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   TEXT,
  actor        TEXT,
  entity_kind  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL,
  before_json  TEXT,
  after_json   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Colunas aditivas (via padrão `PRAGMA table_info` + `ALTER TABLE ADD COLUMN`):

- `backlog_epics`: `project_id`, `description`, `status`, `deleted_at`, `revision`.
- `backlog_features` (persistência legada de Work Items): `description`,
  `deleted_at`, `revision`.
- `runs` e `pipelines`: `project_id` snapshot **nullable** para compatibilidade.
- índices por Project, por repo, por archive/delete e para ordenação (`position`).

`projects.status` não existe: estado ativo/arquivado é derivado de `archived_at`.
UUID v4 é a identidade opaca; `name`/slug nunca é chave relacional.

## Migração em duas fases

1. **PRJ-01 (esta spec)** cria as três tabelas e as colunas nullable, sem alterar
   nenhum dado existente. Como `backlog_epics.project_id` entra nullable aqui, a
   migração não quebra bancos com dados legados.
2. **PRJ-02** faz backup/backfill e **reconstrói** `backlog_epics` (SQLite não
   altera constraint via `ALTER`; exige rebuild "create-copy-drop-rename") para
   tornar `project_id NOT NULL` e `repo_id` nullable/legado.

## Requirements

- Primeiro passo é **aditivo e idempotente**: reexecutar `migrate()` não recria
  tabela nem duplica coluna (`CREATE TABLE IF NOT EXISTS` + `ALTER` condicional).
- `foreign_keys=ON` durante migração e testes (já garantido em `getDb`).
- Constraints `CHECK`, FKs com comportamento explícito (`ON DELETE RESTRICT`) e
  todos os índices necessários.
- Nenhuma coluna normalizada nova pode divergir de `data_json`: os services de
  escrita atualizam coluna e `data_json` na mesma transação e revalidam via Zod
  (mesma disciplina de `updateCatalogFeature` em `src/db/backlogCatalog.ts`).
- `EpicSchema`/`EpicInputSchema` passam a aceitar `description` e `status`
  (`todo|in_progress|done`); o novo `WorkItemSchema` reutiliza/encapsula
  temporariamente `FeatureSchema` e recebe `description` **separado** de `spec`
  (`description` = resumo funcional editável; `spec` = especificação técnica).
- O script real cria backup **antes** da primeira mudança estrutural (a
  infraestrutura de backup verificável é detalhada e consumida em PRJ-02).

## Arquivos afetados

- `src/db/index.ts` — `migrate()`: novo bloco `CREATE TABLE` (projects,
  project_repos, audit_events) e novos `ALTER TABLE ADD COLUMN` condicionais.
- `src/core/backlog/schema.ts` — estender `EpicSchema`/`EpicInputSchema`; criar
  `WorkItemSchema` encapsulando `FeatureSchema`; exportar tipos.
- `scripts/migrate-db.mjs` — sem mudança de contrato; valida a convergência.
- `tests/db/index.test.ts` — cobrir schema novo, idempotência e FKs.
- `tests/harness/` — contratos de migração/gate sandbox (não tocar banco global).

## Success Criteria

- Migração aplicada 2× produz o mesmo schema e os mesmos dados.
- Fixture antiga mantém contagens e conteúdo byte a byte nas colunas existentes.
- `PRAGMA foreign_key_check` e `PRAGMA integrity_check` passam.
- Falha induzida no meio da migração faz rollback e o backup permanece
  restaurável.
