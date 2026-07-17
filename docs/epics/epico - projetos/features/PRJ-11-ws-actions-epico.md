# Feature Specification: WS create/update de Epic project-level

**Feature Branch**: `feat/prj11-ws-epic-create-update`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M2
**Depende de**: PRJ-02, PRJ-03, PRJ-03B, PRJ-05

## Objetivo

Criar e editar Epic pela web sob um Project (não mais sob um repo), com status
**manual** desacoplado do status derivado das runs, delegando ao application
service e mantendo persistência normalizada e `data_json` em lockstep.

## Contexto de execução

Mesmo pipeline WS de PRJ-05: union `WebSocketClientMessage` (`src/web/types.ts:210`),
despacho em `handleClientMessage` (`src/web/server.ts:701`), resposta ao originador
via `sendTo` + `action:result`, reconcile via `reconcileWebState` →
`broadcast('state:full')` (`src/web/server.ts:372`/`:411`).

**Modelo do Epic.** PRJ-01/PRJ-02 já moveram o Epic para sob `project_id` e
adicionaram as colunas `description`, `status`, `revision`, `deleted_at` em
`backlog_epics` (`src/db/index.ts:318`), com `repo_id` tornando-se legado/nullable.
Um Epic novo nasce com `repo_id = NULL` — **nenhum repo arbitrário**. O
`EpicSchema`/`EpicInputSchema` (`src/core/backlog/schema.ts:187`/`:193`) foram
estendidos em PRJ-01 para aceitar `description` e `status` (`todo|in_progress|done`).

**Escrita de catálogo.** Hoje `src/db/backlogCatalog.ts` só tem
`upsertBacklogCatalog`/`diffBacklogCatalog` (sync destrutivo) e
`updateCatalogFeature` (`:549`). PRJ-03/03B introduzem os services de escrita da UI
(`createEpic`/`updateEpic`) que este handler chama. Manter a coluna normalizada
(`status`) e o `data_json` **na mesma transação**, revalidando via Zod — a mesma
disciplina de `updateCatalogFeature` (`src/db/backlogCatalog.ts:549`).

**Status manual × derivado.** O `status` do Epic é definido pelo usuário e **não**
altera status de runs nem de Work Items (o status da feature segue derivado das
runs, como hoje). Não misturar as duas fontes.

Criar Epic é permitido em Project **sem** repos; criar Work Item nele exige um repo
vinculado (invariante validada em PRJ-14/M3, referenciada aqui).

## Contrato WS

```
action:createEpic { requestId, projectId, title, description? }
action:updateEpic { requestId, epicId, expectedRevision, patch: { title?, description?, status?, position? } }
// resposta: action:result { requestId, ok, entity?, error?: { code, message } }
// Epic novo: UUID v4, project_id, status='todo', revision=1, repo_id=NULL
```

## Requirements

- Ações `action:createEpic` e `action:updateEpic`, com `requestId` e validação runtime.
- Novo Epic recebe UUID v4, `project_id`, título, descrição, posição, `status='todo'`,
  `revision=1` e `repo_id=NULL`.
- Status manual aceita apenas `todo|in_progress|done` e não altera status de runs/features.
- `update` usa `expectedRevision` e patch allowlisted.
- `EpicSchema`, persistência normalizada e `data_json` permanecem em lockstep.
- Archive/delete não entram aqui; pertencem a PRJ-17.
- Mutação delega ao application service (PRJ-03B) e gera audit event (via PRJ-03).

## Arquivos afetados

- `src/web/types.ts` — `action:createEpic`/`action:updateEpic` no union cliente.
- `src/web/server.ts` — dois `case` em `handleClientMessage` delegando ao `epicService`.
- `src/web/schemas.ts` — schema Zod discriminado das ações.
- `src/db/backlogCatalog.ts` — services de escrita `createEpic`/`updateEpic` (de PRJ-03B).
- `src/core/backlog/schema.ts` — validar `EpicSchema` estendido (de PRJ-01).
- `tests/web/…` e `tests/backlog/…` — criação, status manual, conflito de revisão.

## Success Criteria

- Criar Epic em Project sem repos é permitido; criar Work Item nele não é.
- Nenhum novo Epic recebe repo arbitrário (`repo_id=NULL`).
- Update concorrente retorna `REVISION_CONFLICT`.
- Testes provam que mudança manual de status não muda runs.
