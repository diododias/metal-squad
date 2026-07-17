# Feature Specification: Policy engine de archive/delete e tombstones

**Feature Branch**: `feat/prj17-lifecycle-policy`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M6
**Depende de**: PRJ-05, PRJ-11, PRJ-14, PRJ-15B

## Objetivo

Entregar um **policy engine único** que decide, para Project/Epic/Work Item, o que
pode ser arquivado, deletado logicamente ou nada — com a checagem e a escrita na
**mesma transação** para não correr com Start. É a fundação de ciclo de vida que
PRJ-18 (UI) e PRJ-19 (restore) consomem; nada de archive/delete existe antes deste
item.

## Contexto de execução

Hoje o produto **só arquiva, e implicitamente**: não há delete nem policy. O único
mecanismo é o `diffBacklogCatalog` (`src/db/backlogCatalog.ts:197`), que marca
`archived_at` no que sumiu do YAML durante o `upsertBacklogCatalog`
(`src/db/backlogCatalog.ts:389`) — inclusive **restaurando** ao reaparecer
(`archived_at = NULL`, `:414`, `:431`). Não existe `deleted_at`, tombstone, nem
recusa por estado. `archived_at` já é coluna em `backlog_epics`/`backlog_features`/
`backlog_tasks` (usada em quase toda query, `:128-186`); `deleted_at`/`revision`
nascem em PRJ-01.

IDs nunca são reusados: `listOccupiedFeatureIds()` (`src/db/backlogCatalog.ts:67`)
retorna **todos** os IDs, inclusive arquivados — o tombstone de delete precisa
manter essa reserva (o ID deletado continua "ocupado").

Classificação de estado depende das tabelas de execução, todas em `src/db/repo.ts`:
`runs`, `pipelines` (`getPipeline`), `gates` (`g.resolved_at IS NULL` = ativo,
`repo.ts:859`), `stage_requests` (pending, `repo.ts:777-782`). "running" = run/
pipeline ativa ou request pendente; "historical" = qualquer run terminal
(done/failed/blocked/canceled/aborted); "pristine" = nenhuma dessas referências e
sem downstream `dependsOn`/task externa/topic. A ordenação topológica por
`dependsOn` está em `src/core/orchestrator/graph.ts`/`scheduler.ts` (fonte para
checar downstream).

Transação e audit: `withTransaction` (`src/db/index.ts:104`); toda decisão/mutação
grava `audit_events` na mesma transação (PRJ-03). O engine é chamado igualmente por
CLI (PRJ-03B) e WS (PRJ-05/11/14) — **um** ponto de decisão, sem duplicação.

## Modelo de decisão

- **pristine**: sem run/pipeline/gate/topic e sem referência dependente.
- **running**: run/pipeline ativa ou request pendente.
- **historical**: qualquer run/pipeline terminal, inclusive done, failed, blocked, canceled e aborted.

## Regras

| Estado | Archive | Delete lógico |
|---|---:|---:|
| pristine | sim | sim |
| running | não; cancelar primeiro | não |
| historical | sim | não |

Delete grava `deleted_at` e tombstone; nunca remove a reserva do ID. Archive grava
`archived_at` e é reversível. Os campos são mutuamente exclusivos (CHECK de PRJ-01).

## Requirements

- Policy engine único para Project/Epic/Work Item, usado por CLI e WS.
- Work Item pristine só é deletável sem downstream `dependsOn`, tasks externas, topic association, gate/request ou pipeline.
- Epic só é deletável quando todos os Work Items já estão tombstonados; Project só quando Epics estão tombstonados e repos desvinculados.
- Archive de Project/Epic não altera filhos automaticamente; listagens efetivas ocultam descendentes de ancestral arquivado.
- Checagem e escrita ocorrem na mesma transação para impedir corrida com Start.
- Ações WS/CLI: archive, delete e restoreArchive, com requestId/revision e erros `ENTITY_RUNNING`, `ENTITY_HAS_HISTORY`, `ENTITY_IN_USE`, `ANCESTOR_ARCHIVED`.
- Toda decisão e mutação gera audit event.

## Arquivos afetados

- `src/core/lifecyclePolicy.ts` (novo) — engine de decisão pristine/running/
  historical para os três níveis; ponto único CLI+WS.
- `src/db/backlogCatalog.ts` — funções `archive*`/`delete*`/`restore*` com
  `archived_at`/`deleted_at` (padrão de `:389-434`); mantém reserva de ID (`:67`).
- `src/db/repo.ts` — leituras de estado (runs/pipelines/gates/stage_requests,
  `:777-860`) consumidas pela policy.
- `src/web/types.ts` — ações `archive*`/`delete*`/`restoreArchived` + erros
  codificados.
- `src/web/server.ts` / `src/commands/*` — handlers chamando a policy.
- `tests/db/*`, `tests/core/*` — matriz completa nos três níveis + referências
  bloqueantes + corrida com Start.

## Success Criteria

- Start concorrente com delete resulta em apenas uma operação válida, nunca estado parcial.
- Failed/aborted é reconhecido como histórico e pode ser arquivado.
- Item tombstonado permanece ocupado para geração de IDs.
- Testes cobrem matriz completa nos três níveis e todas as referências bloqueantes.
