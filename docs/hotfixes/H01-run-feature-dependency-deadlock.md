# H01 — `msq run --feature` precisa falhar explicitamente quando a feature filtrada fica com dependencias nao satisfeitas

**Tipo**: Hotfix  
**Status**: Resolvido  
**Prioridade**: Critica  
**Descoberto em**: 2026-07-06  
**Comando observado**: `rtk node dist/index.js run --feature feat-03`

## Resolucao

Verificado em 2026-07-06 no codigo e nos testes automatizados.

- `selectFeaturePlan()` agora inclui a feature alvo e todas as dependencias transitivas antes da execucao.
- `schedule()` agora detecta deadlock explicito quando nenhuma feature pode iniciar por dependencia ausente ou insatisfeita.
- O comportamento esta coberto por testes para dependencias transitivas, dependencia ausente e erro de deadlock.

## Evidencia de implementacao

- `src/core/orchestrator/graph.ts`
- `src/core/orchestrator/scheduler.ts`
- `tests/orchestrator/graph.test.ts`
- `tests/orchestrator/scheduler.test.ts`
- validacao manual: `rtk npx vitest run tests/orchestrator/graph.test.ts tests/orchestrator/scheduler.test.ts`

## Problema

Ao executar uma feature isolada que declara `dependsOn`, o `msq` pode encerrar com exit code `0` sem executar nada, sem registrar `run` no banco e sem avisar o operador.

No teste de 2026-07-06:
- o backlog do worktree continha apenas `feat-03`, com `dependsOn: [feat-02]`
- `node dist/index.js run --feature feat-03` encerrou em cerca de `0.24s`
- nenhuma nova linha foi criada em `~/.local/share/metal-squad/app.db` na tabela `runs`
- `msq status` continuou mostrando apenas execucoes antigas

## Impacto

- falso positivo de sucesso no fluxo principal do produto
- automacoes podem assumir que a feature foi processada quando nada aconteceu
- dificulta separar falha do `msq` de falha da feature alvo

## Causa tecnica provavel

- `executeBacklog()` filtra a lista topologica para uma unica feature quando `--feature` e usado
- `schedule()` so inicia features cujas dependencias ja estejam marcadas como `done`
- quando a dependencia nao esta no conjunto filtrado, nenhuma feature fica `ready()`
- a Promise interna do scheduler fica sem `resolve/reject`, mas sem handles ativos o processo Node encerra silenciosamente

## Criterios de aceite

- `msq run --feature <id>` deve incluir as dependencias transitivas da feature no plano de execucao, ou falhar com erro explicito antes de iniciar.
- O scheduler deve detectar deadlock por dependencias ausentes ou insatisfeitas e retornar erro nao-zero.
- Quando nenhuma feature puder iniciar, o CLI deve imprimir mensagem acionavel com os IDs bloqueantes.
- Um teste automatizado deve cobrir o caso de feature filtrada com dependencia ausente e garantir que nunca haja exit `0` silencioso.
