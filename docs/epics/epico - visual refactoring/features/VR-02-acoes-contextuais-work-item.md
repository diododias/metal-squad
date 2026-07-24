# Feature Specification: Ações contextuais do Work Item (Start/Resume/Delete/Abort/Cancel)

**Feature Branch**: `feat/vr02-acoes-contextuais-work-item`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M1 (Tema A)
**Depende de**: VR-01

## Objetivo

Fazer o conjunto de ações visíveis num Work Item derivar do estado, seguindo a
tabela do `plan.md`: `Start` só em `TODO`; `Resume` exclusivo de `BLOCKED`;
`Delete` só enquanto nunca iniciado; `Abort` substitui `Delete` após iniciar;
`Cancel` só com run ativa; `Archive` só após `DONE`. Consolidar num componente
único a lógica hoje repartida entre `LifecycleActions` e `startEligibility`.

## Contexto de execução

Peças existentes a reusar (não recriar):

- `components/LifecycleActions.tsx` já renderiza `Cancel`/`Archive`/`Restore`/
  `Delete` a partir de `allowed: AllowedLifecycle` (computado no servidor,
  `core/lifecyclePolicy.ts`), com confirmação tipada e `blockedReason`. **Não
  oferece `Start` nem `Resume`** — são o gap.
- `lib/startEligibility.ts` é o gate único de `action:startFeature`
  (dependências pendentes, `repoUnhealthy`, `integrityIssue`). `BacklogItemDetail`
  já o usa (`eligibility.reason` no `title` do botão Start, `:163`).
- Resume/abort de pipeline já existem no contrato: `action:resumePipeline`
  (`types.ts:599`), `action:resumeWithOverride` (`:606`), e a Run Detail expõe
  `canResumeWithOverride`/`canAbort` (`RunDetailPage.tsx`). Falta expor `Resume`
  na **linha/card** do Work Item quando `BLOCKED`.

O que **falta**: um contrato de UI que combine `allowed` (lifecycle) +
`startEligibility` (start) + estado `BLOCKED` (resume/abort) num só ponto, para
que Board, card, `EpicDetailPage` e `BacklogItemDetail` mostrem exatamente o
mesmo conjunto de botões para o mesmo estado.

## Modelo técnico

- `components/WorkItemActions.tsx` (novo) ou extensão de `LifecycleActions`:
  recebe `allowed`, resultado de `startEligibility`, `pillStatus` (VR-01) e
  callbacks. Deriva:
  - `Start` visível/habilitado só quando `pill === 'not_started'`/`todo` **e**
    `startEligibility.canStart`.
  - `Resume` visível só quando `pill === 'blocked'` → `action:resumePipeline`.
  - `Abort` visível quando há histórico de run (inclui `blocked`) →
    encerra assumindo tokens como waste (liga com VR-03).
  - `Cancel`/`Archive`/`Delete`: continuam vindo de `allowed` (sem recomputar).
- `Start` e `Resume` respeitam `stopPropagation` na linha/card (padrão
  `LifecycleActions` na `KanbanCard`).

## Requirements

- Nenhuma regra de elegibilidade nova no cliente: `Start` usa
  `startEligibility`; `Cancel/Archive/Delete` usam `allowed` do servidor.
- Num item `BLOCKED` convivem `Resume` e `Abort`; `Start` não aparece.
- O mesmo estado produz o mesmo conjunto de botões em todas as superfícies.

## Arquivos afetados

- `src/web/client/components/WorkItemActions.tsx` (novo) ou
  `components/LifecycleActions.tsx` (extensão).
- `src/web/client/pages/BacklogItemDetail.tsx`, `pages/EpicDetailPage.tsx`,
  `components/data/KanbanCard.tsx` — passam a usar o componente unificado.
- `tests/web/work-item-actions.test.tsx` — matriz estado→botões.

## Success Criteria

- **SC-001**: `Start` aparece só em `TODO`; some em running/blocked/done/failed.
- **SC-002**: item `BLOCKED` mostra `Resume` + `Abort`, sem `Start`; `Resume`
  dispara `action:resumePipeline` e volta a `running`.
- **SC-003**: item sem histórico mostra `Delete`; com histórico, `Abort` no
  lugar de `Delete` (regra vinda de `allowed`).
