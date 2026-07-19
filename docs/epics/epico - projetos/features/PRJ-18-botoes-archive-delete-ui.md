# Feature Specification: Ações de ciclo de vida na UI

**Feature Branch**: `feat/prj18-lifecycle-ui`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M6
**Depende de**: PRJ-16, PRJ-17

## Objetivo

Expor na web as ações de **archive / delete / cancelar** para Project, Epic e Work
Item, com os botões dirigidos pela **policy do servidor** (PRJ-17) — nunca por
inferência duplicada no cliente. Delete lógico exige confirmação; running só
oferece cancelar. É a camada de interação sobre o policy engine.

## Contexto de execução

A policy que decide o que é permitido vive no servidor (PRJ-17,
`lifecyclePolicy.ts`), e as ações WS `archive*`/`delete*`/`restoreArchived` já
existem com erros codificados (`ENTITY_RUNNING`, `ENTITY_HAS_HISTORY`,
`ENTITY_IN_USE`, `ANCESTOR_ARCHIVED`). A UI **não** recalcula essas regras: ela
consome o resultado da policy projetado no state (ex.: flags de ações permitidas
por entidade) e habilita/desabilita botões conforme.

Onde os botões entram: nos cards do Board (`KanbanCard`,
`src/web/client/components/data/KanbanCard.tsx:75`, já estendido por PRJ-16), no
detalhe do Work Item (componente legado `BacklogItemDetail`, `src/web/client/pages/BacklogItemDetail.tsx:21`)
e no detalhe do Project/Epic (`ProjectDetailPage`, PRJ-12). Já existe um padrão de
cancelamento de execução: `action:abortPipeline`/`action:requestFeatureAbort`
(`src/web/types.ts:227-228`, handlers em `server.ts:767-777`) — o fluxo "running →
cancelar primeiro" reusa isso.

Confirmação: reusar o `Modal` (`src/web/client/components/feedback/Modal.tsx`) —
delete de Project/Epic exige **confirmação digitada** (nome), Work Item exige
confirmação explícita. Erro de concorrência/policy aparece no ponto de origem
(padrão `requestId`/`revision`) e atualiza o state. A distinção visual entre
Archive (reversível) e Delete (tombstone) usa `Tag`/`StatusPill`.

## Modelo técnico

- State projeta, por entidade, as ações permitidas pela policy (ex.:
  `allowedLifecycle: { archive, delete, cancel }`), computadas server-side.
- `LifecycleActions` (novo componente) renderiza só o que a policy permitiu;
  running mostra "Cancelar" (abort) + motivo do bloqueio.
- Delete → `Modal` de confirmação (digitada para Project/Epic).
- Envio via `send` (`App.tsx:100`) com `requestId`/`expectedRevision`.

## Requirements

- Project, Epic e Work Item exibem ações calculadas pelo resultado da policy do servidor, não por inferência duplicada no cliente.
- Archive disponível para pristine/historical não-running; delete lógico apenas pristine elegível.
- Running oferece primeiro fluxo de cancelar e explica por que lifecycle está bloqueado.
- Delete exige confirmação digitada para Project/Epic e confirmação explícita para Work Item.
- Erro de concorrência/policy aparece no ponto de origem e atualiza o state.
- UI distingue Archive reversível de Delete lógico não restaurável pelo fluxo comum.

## Arquivos afetados

- `src/web/client/components/data/KanbanCard.tsx` — ações de lifecycle no card (`:75`).
- `src/web/client/pages/BacklogItemDetail.tsx` — componente legado; ações no detalhe do Work Item (`:21`).
- `src/web/client/pages/ProjectDetailPage.tsx` — ações no Project/Epic (PRJ-12).
- `src/web/client/components/LifecycleActions.tsx` (novo) + `Modal` de confirmação
  (`components/feedback/Modal.tsx`).
- `src/web/state.ts` — projeção das ações permitidas (resultado da policy PRJ-17).
- `tests/web/*` — policy, confirmação, erro, concorrência.

## Success Criteria

- Failed/canceled mostra Archive; running não mostra operação destrutiva.
- Confirmação cancelada não envia ação.
- Testes de componente e integração WS cobrem policy, confirmação, erro e concorrência.
