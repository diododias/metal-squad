# Feature Specification: UI de Work Item type e preview do workflow

**Feature Branch**: `feat/prj25-work-item-type-ui`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M5
**Depende de**: PRJ-16, PRJ-24

## Objetivo

Dar rosto ao tipo de Work Item na web: seletor `feature|bug` no formulário de
criação, **preview do workflow resolvido** antes de confirmar, badges de tipo e
template no Kanban/detalhe, e filtro por tipo no Board. O preview exibido tem que
ser idêntico ao snapshot que PRJ-24 persiste.

## Contexto de execução

O formulário de criação de Work Item nasce em PRJ-12 (no `ProjectDetailPage`) e
dispara `action:createWorkItem` (PRJ-14/PRJ-24). Esta feature adiciona o campo
`type` a esse form e o passo de **preview**: depois de escolher Project, Epic,
Repository e tipo, o cliente pede o template resolvido
(`resolveTemplate(projectId, type, repoId)`, PRJ-23/PRJ-24) e mostra stages,
skills, versão e origem. Confirmar só é permitido quando o preview é válido para o
repo alvo (skill ausente bloqueia o submit **antes** de enviar `createWorkItem`).

Badges no Board: o `KanbanCard` (`src/web/client/components/data/KanbanCard.tsx:75`)
já foi estendido em PRJ-16 para receber `workItemType` e `repoLabel` em
`KanbanCardRun` (`:25`). Aqui entram o badge de tipo e o de template/version,
reusando `Tag`/`StatusPill` (`src/web/client/components/core/`). O filtro por type
no `BoardPage` (`:40` tem o padrão do `toolFilter`; PRJ-16 adiciona `typeFilter`)
é finalizado nesta UI.

Mudança de tipo: em Work Item **pristine** (sem run) a UI mostra o **diff do
snapshot** (workflow antigo → novo) e pede confirmação, disparando
`action:changeWorkItemType` (PRJ-24); com histórico, o controle fica desabilitado
com o motivo. Work Item legado sem o campo aparece como `feature` (PRJ-22).

Terminologia (ROADMAP §Compatibilidade + SPEC): textos/labels/telemetria usam
**Work Item**; "backlog" fica reservado para a visão/lista, não para a entidade.
O preview reusa `WorkflowStepper` (`src/web/client/components/navigation/WorkflowStepper.tsx:22`)
para desenhar as stages.

## Modelo técnico

- Campo `type` (radio/segmented `feature|bug`, default `feature`) no form de Work Item.
- Passo de preview: request de template resolvido (sob demanda, PRJ-24) → render de
  stages (`WorkflowStepper`), skills por stage, `templateId`/`version`/origem.
- Submit habilitado só com preview válido no repo alvo; skill ausente bloqueia.
- Badges de type e template/version no `KanbanCard` e no detalhe; `typeFilter` no Board.
- Diff de snapshot + confirmação para `changeWorkItemType` (pristine).

## Requirements

- O formulário de criação de Work Item exige seleção `feature|bug`, com default `feature`.
- Após Project, Epic, Repository e tipo, carregar preview resolvido com template, versão, stages, skills e origem.
- Confirmar criação somente quando o preview estiver válido para o Repository alvo.
- Kanban e detalhe do Work Item mostram badges de tipo e template/version aplicados.
- O board inclui filtro por tipo.
- Alteração de tipo em Work Item pristine mostra diff do snapshot e pede confirmação; com histórico fica desabilitada, apresentando o motivo.
- Work Item legado sem o campo aparece como `feature`.
- Textos, labels, acessibilidade e telemetria usam `Work Item`; "backlog" é reservado para a visão/lista, não para o nome da entidade.

## Arquivos afetados

- `src/web/client/pages/ProjectDetailPage.tsx` / `WorkItemForm.tsx` (novo) —
  seletor de tipo + preview.
- `src/web/client/components/data/KanbanCard.tsx` — badges de type e template (`:25`, `:75`).
- `src/web/client/pages/BoardPage.tsx` — `typeFilter` (`:40`).
- `src/web/client/pages/BacklogItemDetail.tsx` — badges + diff/confirmação de tipo.
- `src/web/client/components/navigation/WorkflowStepper.tsx` — reuso no preview (`:22`).
- `tests/web/*` — loading, fallback, erro, diff, labels, acessibilidade.

## Success Criteria

- Preview exibido é igual ao snapshot persistido.
- Skill ausente bloqueia submit antes de enviar `createWorkItem`.
- Filtro de tipo combina corretamente com Project, Epic e tool.
- Testes de componente cobrem loading, fallback, erro, diff, labels e acessibilidade.
