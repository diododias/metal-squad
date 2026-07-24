# Feature Specification: Modelo de estado do Work Item e derivação da pill (`BLOCKED`)

**Feature Branch**: `feat/vr01-modelo-estado-work-item-blocked`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M1 (Tema A)
**Depende de**: —

## Objetivo

Estabelecer uma função pura única que mapeia o estado bruto de um Work Item
(`run.status` + `run.pipelineStatus`) para o `PillStatus` visual, tornando
`BLOCKED` um estado de primeira classe e distinto de `running`, `failed` e
`aborted`. É a base do Tema A: todos os `VR-nn` seguintes (botões, badges do
card, cores) consomem essa derivação em vez de recomputar status por conta.

## Contexto de execução

O produto **já tem quase tudo**, mas espalhado:

- `components/core/StatusPill.tsx` já declara
  `PillStatus = 'running' | 'done' | 'failed' | 'blocked' | 'aborted' | 'not_started'`,
  com ícone/cor/bg próprios para `blocked` (`⊘`, `--accent-warn`,
  `--accent-warn-10`) e spinner animado (`msq-status-spinner`) só em `running`.
- `core/lifecyclePolicy.ts` classifica execução: um pipeline em `blocked`/
  `paused` **conta como running** para fins de lifecycle (é "live, aguardando
  resume"), enquanto `classifyWorkItemState` retorna `pristine|running|historical`.
- Hoje o mapeamento status→pill é **duplicado inline**: `BoardPage.tsx:162`
  força `status: 'todo'` na coluna TODO; `ProjectDetailPage.tsx:263` e
  `EpicDetailPage.tsx:218` derivam a pill do Epic com ternários locais; a
  `KanbanCard` recebe `run.status` já resolvido de fora.

O que **falta**: um `pillStatus(run)` central em `lib/` que traduza
`pipelineStatus` (`running|paused|blocked|aborted|done|failed`) + `run.status`
para o `PillStatus` correto, com `blocked` cobrindo os três gatilhos do
`plan.md`: dependência não satisfeita, run pausada pelo usuário, sessão
interrompida por timeout/limite.

## Modelo técnico

- `lib/pillStatus.ts` (novo): `pillStatus(input): PillStatus` puro. Entrada
  mínima: `{ status, pipelineStatus, blockedReason? }`. Regra: `paused`/`blocked`
  → `blocked`; `aborted` → `aborted`; `running` → `running`; sem run →
  `not_started`.
- Substituir os ternários inline de `BoardPage`, `KanbanCard`,
  `Project/EpicDetailPage` por essa função (sem mudar a aparência do Epic, que
  tem só `todo|in_progress|done` — ver VR-05).
- Nenhuma mudança em `StatusPill` além de garantir que `blocked` recebe `label`
  amigável ("blocked").

## Requirements

- `BLOCKED` é visualmente distinto de `running`, `failed` e `aborted` (cor de
  atenção, ícone `⊘`) — reusar o que `StatusPill` já define, sem novo token.
- A derivação status→pill vive num único lugar e é coberta por teste unitário
  com todos os `pipelineStatus`.
- Nenhuma regressão nas colunas do Board nem nas pills de Epic.

## Arquivos afetados

- `src/web/client/lib/pillStatus.ts` (novo).
- `src/web/client/pages/BoardPage.tsx`, `components/data/KanbanCard.tsx`,
  `pages/ProjectDetailPage.tsx`, `pages/EpicDetailPage.tsx` — passam a usar a
  função.
- `tests/web/pill-status.test.ts` (novo) — tabela de mapeamento.

## Success Criteria

- **SC-001**: um Work Item com pipeline `paused`/`blocked` renderiza a pill
  `blocked`, nunca `running` nem `aborted`.
- **SC-002**: o mapeamento status→pill tem cobertura de teste para os 6
  `pipelineStatus` e para o caso sem run (`not_started`).
- **SC-003**: Board e listas de detalhe mantêm a aparência atual para
  `todo/running/done/failed`.
