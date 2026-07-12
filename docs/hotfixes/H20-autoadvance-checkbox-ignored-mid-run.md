# H20 — Checkbox `autoAdvance` no dashboard web e ignorado por runs ja em andamento

**Tipo**: Hotfix
**Status**: Concluido
**Prioridade**: Alta
**Descoberto em**: 2026-07-12
**Comando observado**: `msq ui` (dashboard web) — marcar `autoAdvance` no config da feature enquanto uma run staged ja esta em execucao

## Problema

Marcar o checkbox `autoAdvance` na tela de config da feature (`FeaturePreview`)
enquanto uma run staged ja estava em andamento nao tinha nenhum efeito sobre
essa run: ela continuava pedindo aprovacao manual a cada transicao de stage,
como se o checkbox nunca tivesse sido marcado.

## Causa raiz

`executeStagedFeature` (`src/core/runner/execute.ts`) calculava
`autoAdvance` uma unica vez, no inicio da funcao, a partir do objeto
`feature` recebido quando a run comecou:

```ts
const autoAdvance = (opts.autoAdvanceStages ?? workflow.approvals.autoAdvance) || config.workflow.autoAdvanceStages;
```

Esse valor ficava fechado (closure) para todas as transicoes de stage do
loop, do inicio ao fim da run. O checkbox no dashboard, por sua vez, grava a
mudanca via `action:updateFeatureConfig` -> `updateCatalogFeature()`
(`src/db/backlogCatalog.ts`), que so atualiza a linha `data_json` da feature
no catalogo — sem nenhuma via para alcancar o processo da run ja em
execucao. Runs novas liam o valor atualizado; a run em andamento nunca via a
mudanca.

## Resolucao aplicada

- `src/db/backlogCatalog.ts`: novo `getCatalogFeature(repoId, featureId)`,
  leitura single-row somente-leitura (mesmo padrao de
  `updateCatalogFeature`), retornando `Feature | undefined`.
- `src/core/runner/execute.ts` (`executeStagedFeature`): a checagem de
  `autoAdvance` virou uma funcao (`resolveAutoAdvance()`) chamada
  imediatamente antes de cada transicao de stage, que re-lê
  `workflow.approvals.autoAdvance` do catalogo via `getCatalogFeature()` em
  vez de reusar o valor capturado no inicio da run. `opts.autoAdvanceStages`
  (flag de CLI/override explicito) continua tendo prioridade absoluta e
  nunca é sobrescrito pelo catalogo. Se a leitura do catalogo falhar (ex.:
  harness sandboxado sem banco gravavel), cai de volta no valor capturado no
  inicio da run em vez de derrubar a transicao.

Com isso, marcar o checkbox durante uma run em andamento passa a valer a
partir da proxima transicao de stage — nao precisa mais reiniciar a run.

## Testes

- `tests/runner/execute.test.ts`: novo teste
  (`honors autoAdvance toggled mid-run via the catalog instead of the value
  captured at run start`) — run staged comeca com `autoAdvance: false`,
  `getCatalogFeature` mockado retorna `autoAdvance: true`, e o teste
  confirma que a transicao segue o caminho de auto-advance (`createStageRequest`
  com `source: 'auto'`) sem nunca chamar `getStageRequest` (i.e. sem bloquear
  esperando aprovacao manual).
- `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck` e
  `rtk npm run lint` passam (873 testes).

## Criterios de aceite

- [x] Marcar `autoAdvance` no dashboard web durante uma run staged em
      andamento afeta a proxima transicao de stage dessa run
- [x] `opts.autoAdvanceStages` (override de CLI) continua com prioridade
      sobre o valor do catalogo
- [x] Falha na leitura do catalogo nao derruba a run — cai de volta no valor
      capturado no inicio
- [x] `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck`,
      `rtk npm run lint` passam

## Notas

- Nao ha mudanca de schema nem de contrato do backlog; a mudanca e apenas na
  fonte de verdade lida a cada transicao de stage.
- `RunDetail.js` (tela de detalhe da run) hoje so exibe `autoAdvance` como
  linha read-only — o campo editavel vive em `FeaturePreview` (tela de
  config da feature, acessivel a partir do dashboard).
