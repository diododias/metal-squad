# Feature Specification: Import `seed` não-destrutivo com conflitos explícitos

**Feature Branch**: `feat/prj04-import-seed-nao-destrutivo`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M1
**Depende de**: PRJ-01, PRJ-02, PRJ-03

## Objetivo

Transformar `msq backlog load` em um **import de bootstrap previsível**: nunca
apaga nem sobrescreve estado gerenciado no DB e nunca oculta divergências. Hoje o
comando é destrutivo — arquiva o que sumiu do YAML e sobrescreve o que mudou.

## Contexto de execução

Fluxo atual do comando (`src/commands/backlog.ts`, arquivo inteiro, 59 linhas):

1. `loadBacklogWithRegistration(file, cwd)` (`src/core/backlog/load.ts:134`) lê e
   valida o YAML.
2. `resolveRepo(cwd)` (`src/core/repo.ts:12`) resolve `repoId`/`path`.
3. `--dry-run` → chama `diffBacklogCatalog(parsed, repoId)`
   (`src/db/backlogCatalog.ts:197`) e imprime; **não** compartilha o mesmo
   planejador do commit (divergência a corrigir).
4. Commit → `stageBacklogFile(...)` (`src/core/backlog/load.ts:178`, com
   `.commit()`/`.rollback()`) + `upsertBacklogCatalog(parsed, repoId, ...)`
   (`src/db/backlogCatalog.ts:389`).

O problema está em `upsertBacklogCatalog`: é um upsert que **arquiva tasks
ausentes** (`archiveTaskById`, `src/db/backlogCatalog.ts:451,501-503`) e
sobrescreve `data_json` de features/epics existentes
(`src/db/backlogCatalog.ts:420-449`). `diffBacklogCatalog` hoje só classifica
`added/changed/archived/unchanged` (`:203-218`) — não distingue conflito de
mudança benigna.

Alvo: um **planejador de seed único** que produz classificação por item e é
compartilhado entre `--dry-run` e o commit (elimina a divergência do passo 3). O
`upsertBacklogCatalog` destrutivo sai do fluxo normal, mas pode permanecer
isolado para compat/teste até remoção posterior.

Integração com o épico: import legado é **repo-local** e cai no **Project
implícito** daquele repo (criado em PRJ-02). Geração de IDs e staging do arquivo
(`stageBacklogFile`, `rekeyCatalogFeature` em `src/db/backlogCatalog.ts:300`) não
podem deixar arquivo e DB em estados divergentes — commit dos dois lados tem
compensação/rollback documentado (o padrão `staged.commit()/rollback()` já existe).

## Resultado do import

Cada item é classificado como um de: `created`, `unchanged`, `conflict`,
`invalid` ou `skipped`. **Ausência no YAML nunca arquiva/deleta** o item do DB.

- `created` — item ausente no DB é criado.
- `unchanged` — mesmo ID, conteúdo semanticamente igual.
- `conflict` — mesmo ID, conteúdo diferente → **não** é alterado; reporta path do
  campo, valor no DB, valor importado e ação sugerida.
- `invalid` — falha de validação Zod ou dependência para feature de outro repo.
- `skipped` — fora do escopo mutável.

## Requirements

- `--mode seed` é o **default e único** modo mutável deste épico.
- `--dry-run --format json` usa **exatamente** o mesmo planejador do commit.
- Item ausente no DB é criado; item semanticamente igual é `unchanged`; mesmo ID
  com conteúdo diferente é `conflict` e não é alterado.
- Conflitos incluem path do campo, valor no DB, valor importado e ação sugerida.
- YAML vazio é no-op; import repetido é idempotente.
- `diffBacklogCatalog` destrutivo é removido do fluxo normal, mas pode permanecer
  isolado para compat/teste até remoção posterior.
- Import legado é repo-local e cai no Project implícito daquele repo.
- Dependência para feature de outro repo é `invalid` neste épico (cross-repo fora
  de escopo).
- `stageBacklogFile`/geração de IDs não pode deixar arquivo e DB em estados
  diferentes; commit dos dois lados tem compensação/rollback documentado.

## Arquivos afetados

- `src/commands/backlog.ts` — reescrever a action `load`: `--mode seed`,
  `--format json`, usar o planejador único; remover chamada a
  `upsertBacklogCatalog` do fluxo normal.
- `src/db/backlogCatalog.ts` — novo planejador de seed (classificação
  created/unchanged/conflict/invalid/skipped) e o aplicador não-destrutivo;
  isolar `upsertBacklogCatalog`/`diffBacklogCatalog` legados.
- `src/core/backlog/load.ts` — reuso de `loadBacklogWithRegistration` e
  `stageBacklogFile`; garantir rollback coordenado arquivo↔DB.
- `tests/backlog/` — snapshot/contract test da saída JSON; casos
  created/unchanged/conflict/invalid.
- `tests/commands/commands.test.ts` — comportamento do comando e do `--dry-run`.

## Success Criteria

- Item criado pela web sobrevive a qualquer import (nunca é arquivado por ausência
  no YAML).
- Alteração manual no YAML de item já existente produz `conflict`, nunca overwrite
  silencioso.
- Duas execuções geram o mesmo relatório após a primeira criação (idempotência).
- Saída JSON é coberta por snapshot/contract test.
