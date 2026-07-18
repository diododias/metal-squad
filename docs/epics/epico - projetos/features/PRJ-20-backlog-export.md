# Feature Specification: Backup/restore e export DB→YAML v3

**Feature Branch**: `feat/prj20-backup-export-v3`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M7
**Depende de**: PRJ-04, PRJ-15, PRJ-17, PRJ-24

## Objetivo

Oferecer disaster recovery do DB e um formato versionável capaz de representar
Project/Epic multi-repo sem duplicar Epic em vários `backlog.yaml` repo-locais.

## Contexto de execução

Dois pilares já existem no código e são reusados; nenhum é reinventado.

**Serialização YAML.** `src/core/backlog/load.ts:3` já importa `parse, stringify`
do pacote `yaml`, e `stageBacklogFile` (`src/core/backlog/load.ts:178`) já
serializa um `BacklogV2` para arquivo via `stringify`. `BACKLOG_FILE`
(`load.ts:24`) e o import v2 (`loadBacklogWithRegistration`, `:134`) são a base; o
export v3 estende esse caminho para ler do **DB** (catálogo agregado por Project,
PRJ-15) em vez de montar do YAML — a fonte de verdade agora é o DB (SPEC §3).

**Import não-destrutivo.** PRJ-04 já entrega `importBacklogCatalog` (seed) separado
do `diffBacklogCatalog` (aposentado do load) e o relatório de conflitos. O
`backlog load` v3 reusa esse relatório: resolve repos por `repoId`/remote, pede
mapeamento local quando necessário e **nunca** sobrescreve o DB silenciosamente.

**Backup do SQLite.** Hoje há `migrate:db` (`scripts/migrate-db.mjs`,
`package.json:15`) e `clean:db` (`package.json:33`), mas **não** há `db backup`/
`restore`. O backup precisa ser consistente com WAL (o DB roda WAL; usar o backup
API do SQLite/`better-sqlite3`, não `cp` cru) e validar o arquivo gerado. `restore`
exige confirmação, faz backup do destino e roda `PRAGMA integrity_check` +
`foreign_key_check` (mesmos usados na migração, ver PRJ-01) antes de substituir.

**Segurança do asset.** Export não pode conter segredos nem paths absolutos — a
mesma disciplina de `sanitizeRuntimeConfig` (`src/web/state.ts:196`) que já barra
credenciais bearer. Path local do repo fica fora por default (só com flag
explícita); `repoId`/label/remote opcional entram.

Comandos entram via `register*(program)` (padrão `registerBacklog`,
`src/commands/backlog.ts:15`), sem lógica no handler.

## Dois contratos distintos

1. `msq db backup|restore`: cópia consistente do SQLite para recuperação operacional.
2. `msq backlog export`: serialização portátil do domínio, sem segredos nem paths absolutos.

## Formato YAML v3

- `version: 3`.
- Project: id, name, description e posições.
- Repositories: repoId, label e remote opcional; path local não é exportado por default.
- Epics project-level com descrição/status.
- Work Items com `repoId`, type, dependências, config resolvida/snapshot e metadados de template. No YAML v3 o campo canônico é `workItems`; import v2 continua aceitando `features`.
- Archived só com `--include-archived`; tombstones e audit events não entram no asset normal.

## Requirements

- `msq db backup --output` usa mecanismo consistente com WAL e valida o arquivo gerado.
- `msq db restore` exige confirmação, cria backup do destino e executa integrity/FK checks antes de substituir.
- `msq backlog export --project <id> [--file|-] [--format yaml|json]` escreve atomicamente.
- Export por repo v2 pode existir para compatibilidade, mas não promete round-trip de Project multi-repo.
- `backlog load` passa a aceitar v3 em modo seed, resolvendo repos por repoId/remote e pedindo mapeamento local quando necessário.
- Conflitos usam o mesmo relatório de PRJ-04; nunca sobrescrevem DB silenciosamente.
- Template snapshot é exportado; referência a template é metadado, não requisito para reimportar.

## Arquivos afetados

- `src/commands/db.ts` (novo) — `msq db backup|restore` via `register*(program)`
  (padrão `backlog.ts:15`).
- `src/commands/backlog.ts` — subcomando `export`; `load` aceita v3 seed.
- `src/core/backlog/export.ts` (novo) — serialização DB→YAML v3 reusando
  `stringify` (`load.ts:3`) e o catálogo por Project (PRJ-15).
- `src/core/backlog/schema.ts` — `BacklogV3Schema` (`workItems`, Project-level).
- `src/db/index.ts` — backup API WAL-safe + `integrity_check`/`foreign_key_check`.
- `scripts/` — se necessário, wrapper de backup/restore.
- `tests/backlog/*`, `tests/db/*` — round-trip v3, backup/restore, ausência de segredos.

## Success Criteria

- Backup de DB em WAL restaura runs, catálogo, Projects e templates.
- Round-trip v3 preserva todos os itens ativos e relações Project/Epic/repo.
- Epic multi-repo aparece uma única vez no arquivo.
- Export não contém tokens, secrets, password, webhook ou path absoluto sem flag explícita.
