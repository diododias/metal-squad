# F45 — Piloto Automatico (Auto-Pilot de Backlog)

**Tipo**: Feature
**Status**: Pendente — triagem
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

## Proximo passo

Definir precisamente a distincao entre "falhou por falta de tokens/limite"
(nao deve puxar proxima demanda — ver F14 budget caps) e outras falhas (deve
puxar). Isso depende de como `onFail`/budget cap hoje sinalizam o motivo da
falha (`src/core/orchestrator/`, `src/db/`).
