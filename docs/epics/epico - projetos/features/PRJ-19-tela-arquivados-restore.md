# Feature Specification: Tela `/archived`, restore e audit trail

**Feature Branch**: `feat/prj19-archived-restore`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M6
**Depende de**: PRJ-17, PRJ-18

## Objetivo

Entregar a rota `/archived`: listar Projects/Epics/Work Items arquivados,
filtrar/paginar, **restaurar** (limpar `archived_at`) respeitando ancestrais e
integridade de repo, e exibir a timeline de audit da entidade. Fecha o ciclo de
vida aberto em PRJ-17/18.

## Contexto de execução

O roteamento é hash-based enumerado (`src/web/client/lib/routes.ts:1-19`) — hoje
sem `/archived`; entra como novo membro de `Route` + ramo em `parseHash` + item em
`navItems` (`App.tsx:122`), mesmo padrão de PRJ-08. A listagem consome a projeção
**arquivados** já separada da ativa em PRJ-15 (`listWorkItemsByScope({ lifecycle:
'archived' })`) e as queries de Project/Epic com `includeArchived` de PRJ-03. A
regra de que arquivados **não** entram na lista padrão mas são consultáveis foi
prevista em PRJ-07.

Restore é a ação `action:restoreArchived { kind, id }` (PRJ-17): limpa
`archived_at` e incrementa `revision`. O produto já tem o mecânico de restaurar
(`upsertBacklogCatalog` seta `archived_at = NULL`, `src/db/backlogCatalog.ts:414`,
`:431`) — aqui vira ação explícita e validada. Restaurar filho exige **ancestral
ativo** (senão `ANCESTOR_ARCHIVED`); não há cascata implícita — a UI oferece
link/fluxo para restaurar o ancestral primeiro.

Integridade do Work Item: só restaura se o repo ainda estiver vinculado ao **mesmo
Project** e as relações forem íntegras (repo transferido/inacessível bloqueia com
instrução acionável, reusando `resolveWorkItemExecutionContext` de PRJ-15B).
Conflito de nome/posição **não** bloqueia; conflito de identidade/relação bloqueia.

Tombstones (delete lógico) **não** aparecem como itens restauráveis comuns — ficam
no **audit trail administrativo**. A timeline vem de `audit_events` (PRJ-01/03),
exibida por entidade.

## Modelo técnico

- Rota: `| { page: 'archived' }` + `parseHash` (`h === '/archived'`) + `navItems`.
- `ArchivedPage({ state, send })`: filtros (Project, nível, repo, type, data),
  paginação, listagem `lifecycle: 'archived'`.
- Ação `action:restoreArchived { requestId, kind, id, expectedRevision }`.
- Timeline: consulta de `audit_events` por `entity_kind`/`entity_id`.

## Requirements

- Rota `/archived` paginada, filtrável por Project, nível, repo, type e data.
- Listar somente archived; tombstones ficam no audit trail administrativo, não como itens restauráveis comuns.
- Restore limpa `archived_at` e incrementa revision.
- Restaurar filho exige ancestral ativo. Não há cascata implícita; UI oferece link/fluxo para restaurar ancestral primeiro.
- Work Item só restaura se repo ainda estiver vinculado ao mesmo Project e relações forem íntegras.
- Conflito de nome/posição não bloqueia restore; conflito de identidade/relação bloqueia com instrução acionável.
- Exibir timeline de audit events da entidade.

## Arquivos afetados

- `src/web/client/lib/routes.ts` — rota `archived` + `parseHash`.
- `src/web/client/App.tsx` — `navItems` (`:122`), render da rota.
- `src/web/client/pages/ArchivedPage.tsx` (novo) — lista, filtros, restore, timeline.
- `src/web/types.ts` — `action:restoreArchived` (PRJ-17) + projeção de arquivados.
- `src/db/backlogCatalog.ts` / `src/db/repo.ts` — queries `lifecycle: archived` e
  audit por entidade (PRJ-15/PRJ-01).
- `tests/web/*` — filtros, paginação, ancestrais, audit timeline.

## Success Criteria

- Project, Epic e Work Item arquivados aparecem e restauram respeitando ancestrais.
- Repo transferido/inacessível bloqueia restore do Work Item sem criar órfão.
- Dois restores concorrentes são idempotentes/revisionados.
- Testes automatizados cobrem filtros, paginação, ancestrais e audit timeline.
