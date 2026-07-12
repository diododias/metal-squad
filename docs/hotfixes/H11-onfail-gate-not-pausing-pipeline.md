# H11 — `onFail: gate` nao pausa a pipeline; run fica "blocked" sem forma de retomar

**Tipo**: Hotfix
**Status**: Concluido
**Prioridade**: Alta
**Descoberto em**: 2026-07-11
**Comando observado**: `msq run`/`msq ui` com uma feature usando `retry.onFail: gate`

## Problema

Ao aprovar um gate criado por `retry.onFail: gate` na TUI, o run ficava marcado
como "blocked" e os botoes de abort/resume nao tinham efeito nenhum — o estado
nunca mudava.

## Causa raiz

`runWithRetry` (`src/core/runner/execute.ts`) so chama `createGate()` quando as
tentativas se esgotam com `onFail: gate`; nunca chama `pausePipeline()`. O
scheduler (`src/core/orchestrator/scheduler.ts`), por sua vez, tratava
`onFail: gate` exatamente como `onFail: continue`: adicionava a feature a
`done` e seguia o `pump()` normalmente. Resultado:

- a pipeline inteira terminava (`finishPipeline(pipelineId, 'done')`) mesmo com
  o gate ainda pendente de decisao;
- a run daquela feature ficava com `status = 'blocked'` gravado permanentemente
  no banco, mas sem nenhum processo vivo por tras;
- `forceResolveGate()` (`src/db/repo.ts`) so chama `resumePipeline()` quando
  `pipeline.status` e `'paused'`/`'blocked'` — como a pipeline ja estava
  `'done'`, aprovar o gate virava no-op silencioso;
- o mesmo valia para abort: nao havia execucao ativa para abortar.

Isso e diferente do gate de estouro de budget, que ja chama `pausePipeline()`
(`handleGlobalBudgetViolation`) e por isso resume corretamente hoje via
`controlPoller`.

## Resolucao aplicada

- `src/core/orchestrator/scheduler.ts`: quando `!resultValue.ok` e
  `feature.retry.onFail === 'gate'`, a feature volta para `remaining` (sem
  entrar em `done`) e o scheduler transita para `paused` em vez de continuar o
  `pump()`. Isso reaproveita o `onStateChange` ja existente em
  `src/core/runner/execute.ts`, que chama `pausePipeline(pipelineId)` sempre
  que o estado vira `'paused'` — a mesma via ja usada pelo gate de budget.
- `src/core/runner/execute.ts` (`executeStagedFeature`): o `isResume` passado
  para `determineStageStartIndex` agora tambem fica `true` quando
  `pipelines.current_stage` ja esta setado, nao só quando existe
  `opts.resumePipelineId` (flag exclusiva do `msq resume`). Isso garante que,
  ao retomar dentro do mesmo processo apos a aprovacao do gate, o workflow
  staged reexecute apenas o stage que falhou em vez de reiniciar do indice 0.

Com isso, aprovar o gate (`forceResolveGate`) volta a funcionar: o pipeline
esta de fato `'paused'`, `resumePipeline()` muda o status para `'running'`, o
`controlPoller` detecta a mudanca e chama `scheduler.resume()`, que redespacha
a mesma feature.

## Testes

- `tests/orchestrator/scheduler.test.ts`: novo teste unitario cobrindo pausa em
  `onFail: gate` e redispatch da mesma feature apos `resume()`, incluindo o
  dependente so rodar depois que a feature bloqueada e concluida com sucesso.
- `tests/runner/execute.test.ts`: teste existente de gate atualizado para
  refletir o comportamento correto — a pipeline permanece pausada
  (`finishPipeline` nao e chamado) ate a simulacao de aprovacao do gate, e so
  entao a mesma feature e reexecutada e a pipeline conclui.

## Criterios de aceite

- [x] Uma feature com `retry.onFail: gate` pausa a pipeline (nao a marca como
      concluida) ao esgotar as tentativas
- [x] Aprovar o gate (`forceResolveGate`) resume a execucao da mesma feature
- [x] Workflows staged retomam no stage que falhou, sem reexecutar stages ja
      concluidos
- [x] `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck` e
      `rtk npm run lint` passam (800 testes)

## Notas

- Nao ha mudanca de schema nem de contrato do backlog; a mudanca e apenas no
  scheduler e na resolucao do indice de stage inicial.
- F39 (`docs/features/F39-adapter-fallback-resume.md`) e complementar: trata de
  trocar tool/model no fallback e resumo via `msq resume` como processo novo;
  este hotfix corrige o caminho de gate dentro do mesmo processo, que F39
  tambem depende para funcionar corretamente.
