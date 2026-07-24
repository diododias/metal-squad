# Feature Specification: Ciclo de vida do Epic — schema, `in_review` e transições automáticas

**Feature Branch**: `feat/vr05-ciclo-vida-epic-schema-transicoes`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M1 (Tema A)
**Depende de**: VR-01
**Requer backend**: sim (schema + migração + derivação de status)

## Objetivo

Fazer o status do Epic reagir ao trabalho, em vez de ser um dropdown manual.
Introduzir `in_review` e as transições automáticas do `plan.md`: ao iniciar o
1º Work Item o Epic vira `in_progress`; ao concluir todas as demandas vira
`in_review` (aguardando aprovação — ver VR-06).

## Contexto de execução

Estado atual (gap real, não cosmético):

- `EpicStatus` é `z.enum(['todo', 'in_progress', 'done'])`
  (`core/backlog/schema.ts:277`), definido **manualmente** pelo usuário via
  `EpicEditor` (`pages/EpicEditor.tsx:25`) e persistido em `db/repo.ts`
  (`epicEntity`, `:1210`). Não há `in_review` nem transição automática.
- A UI já pinta o status: `ProjectDetailPage.tsx:263` e `EpicDetailPage.tsx:218`
  mapeiam `done→done`, `in_progress→running`, resto→`not_started`.
- `core/lifecyclePolicy.ts` já sabe classificar execução de Work Item
  (`classifyWorkItemState`) — a agregação para o Epic (todos os itens `done`?
  algum iniciado?) é o que falta.

O que **falta** (backend): (1) estender `EpicStatusSchema` com `in_review`;
(2) migração de dados; (3) derivar/transicionar o status a partir do estado
agregado dos Work Items do Epic, num único ponto (repo/policy), disparado quando
um item inicia ou conclui; (4) propagar no snapshot WS.

## Modelo técnico

- **Schema**: `EpicStatusSchema = z.enum(['todo','in_progress','in_review',
  'done','archived'])` (arquivo `core/backlog/schema.ts`); ajustar
  `web/schemas.ts:119` e `web/types.ts:586`.
- **Migração**: `src/db/` — migração aditiva; itens `done` legados permanecem
  `done`; nenhum destrutivo (ver `harness.md`).
- **Derivação**: função em `core/` (junto de `lifecyclePolicy`) que computa o
  status-alvo do Epic dos estados dos Work Items: algum iniciado → ≥`in_progress`;
  todos concluídos → `in_review`. Chamada nas transições de Work Item (start/
  done) dentro da mesma transação.
- **Front**: `pillStatus` (VR-01) e os mapeamentos de Epic ganham `in_review`
  (cor de atenção/revisão) e `archived`.

## Requirements

- Iniciar o 1º Work Item de um Epic `todo` move-o para `in_progress`
  automaticamente.
- Concluir todos os Work Items move o Epic para `in_review`.
- A transição é derivada de estado, idempotente e testada; edição manual só
  permanece onde fizer sentido (ver VR-06/VR-11).
- Migração não perde nem corrompe status existentes.

## Arquivos afetados

- `src/core/backlog/schema.ts` (`EpicStatusSchema`), `src/core/lifecyclePolicy.ts`
  ou vizinho (derivação), `src/db/` (migração + repo).
- `src/web/types.ts`, `src/web/schemas.ts`.
- `src/web/client/pages/ProjectDetailPage.tsx`, `EpicDetailPage.tsx`,
  `EpicEditor.tsx`, `lib/pillStatus.ts`.
- `tests/backlog/`, `tests/db/`, `tests/web/` — enum, migração, transições.

## Success Criteria

- **SC-001**: Epic `todo` vira `in_progress` ao iniciar o primeiro Work Item.
- **SC-002**: Epic vira `in_review` quando todos os Work Items estão `done`.
- **SC-003**: migração preserva `todo/in_progress/done` legados; a suite de db
  passa em banco sandbox (`gate:full`).
