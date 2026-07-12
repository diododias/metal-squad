# F45 — Piloto Automatico (Auto-Pilot de Backlog)

**Tipo**: Feature
**Status**: Implementado
**Prioridade sugerida**: Alta
**Relaciona**: F14 (Budget Caps), F12 (Pause/Resume/Abort), orchestrator/scheduler

## Relato do usuario (2026-07-11)

> Permitir piloto automatico, de forma que uma feature seja concluida e outra
> ja seja iniciada desde que nao tenha dependencias pendentes
> Quando uma feature entra em bloqueio (pausada esperando aprovacao ou falhou
> por motivos diferentes de falta de tokens/limite excedido), deve puxar a
> proxima demanda no backlog e por para iniciar
> demanda no backlog devem ser marcadas para execucao automatica, nao
> iniciando demandas que nao tiverem marcadas para execucao automatica,
> sendo iniciadas apenas manualmente

## Problema

Hoje o disparo de uma nova feature parece manual. O pedido e um modo "piloto
automatico" onde:

1. Ao concluir uma feature, a proxima elegivel (sem dependencia pendente) e
   iniciada automaticamente.
2. Se uma feature trava (gate pendente de aprovacao, ou falha que nao seja
   por budget/limite de tokens), o piloto pula para a proxima demanda
   elegivel do backlog em vez de ficar parado.
3. Isso so vale para demandas explicitamente marcadas como "auto exec" no
   backlog — demandas sem essa marca so iniciam manualmente.

## Escopo provavel

- `src/core/orchestrator/` — scheduler ja faz ordenacao topologica; este
  modo adiciona um loop de "o que iniciar a seguir" reagindo a eventos de
  conclusao/falha/bloqueio
- `src/core/events/` — provavel gatilho via event bus (`run:done`,
  `run:failed`, `run:blocked`)
- `src/core/backlog/` — novo campo no schema (`autoStart`/similar) por
  feature/demanda

## Comportamento implementado

- `Feature.autoStart: boolean` (default `false`) no schema do backlog
  (`src/core/backlog/schema.ts`). So features com `autoStart: true` participam
  da continuacao automatica; `autoStart: false` continua iniciando apenas
  manualmente (`msq run --feature`, `action:startFeature`).
- A decisao de auto-pilot roda dentro do processo que executa a feature
  (`src/core/runner/execute.ts`, `evaluateAutoPilot`), disparada apos cada
  outcome qualificante da feature que **disparou** a avaliacao (ela mesma
  precisa ter `autoStart: true`). Quando ha um proximo candidato elegivel, o
  runner spawna um novo processo detached (`msq run --feature <id>`), o mesmo
  padrao "fire and forget" que `src/web/server.ts` ja usa para iniciar
  features pela UI — cada `msq run --feature` roda no seu proprio processo,
  entao nao ha event bus compartilhado entre eles.
- Classificacao de outcome (`src/core/orchestrator/autoPilot.ts`):
  - `success` (`run:done`) → continua.
  - `blocked-human` (`run:blocked` com motivo `needs_input`/`gate`) → deixa a
    feature bloqueada e continua para a proxima elegivel.
  - `failed-execution` (`run:failed` com `kind: 'execution'`) → deixa a
    feature falhada e continua para a proxima elegivel.
  - `blocked-protective` (`run:blocked` com motivo `budget`/`token`) → **para**
    o piloto automatico; nenhuma nova feature e disparada ate intervencao
    manual (mantem a garantia de custo do F14).
  - `aborted-manual` (`run:failed` com `kind: 'aborted'`) → nao continua;
    recuperacao fica manual.
- Selecao do proximo candidato (`selectNextAutoStartCandidate`) preserva a
  ordem topologica existente, re-le a config live da feature via
  `getCatalogFeature` (mesmo padrao ja usado por
  `workflow.approvals.autoAdvance`) e exclui features ja `done` ou ja ativas
  (lidas via `listCompletedFeatureIds`/`listRunsForTui`).
- Eventos novos em `src/core/events/types.ts`: `run:blocked` (substitui a
  ambiguidade anterior de blocked vs `run:failed`) e `autopilot:decision`
  (telemetria de toda avaliacao: `action` = `start`/`idle`/`stop`). Ambos sao
  broadcastados para clientes web via `BROADCAST_EVENTS`
  (`src/web/server.ts`).
- `autoStart` e editavel via `action:updateFeatureConfig` (web) e exposto em
  `FeaturePreview.js` (checkbox) e `FeatureConfigSection.tsx` (TUI, read-only).
