# H21 — `Boolean(...)` coercion em `run`/`resume` sempre vencia o checkbox `autoAdvance` do catalogo

**Tipo**: Hotfix
**Status**: Concluido
**Prioridade**: Alta
**Descoberto em**: 2026-07-12
**Comando observado**: `msq ui` (dashboard web) — marcar `autoAdvance` na config da feature e disparar a run pelo botao "Start"; a primeira transicao de stage avancou sozinha, a seguinte voltou a pedir aprovacao manual.

## Problema

Mesmo depois de H20 (re-ler `workflow.approvals.autoAdvance` do catalogo a
cada transicao de stage via `resolveAutoAdvance()`), runs disparadas pelo
dashboard web continuavam pedindo aprovacao manual em transicoes
subsequentes.

## Causa raiz

`resolveAutoAdvance()` (`src/core/runner/execute.ts`) da prioridade absoluta
a `opts.autoAdvanceStages` quando ele esta definido:

```ts
if (opts.autoAdvanceStages !== undefined) return opts.autoAdvanceStages;
```

Isso e correto para um override explicito de CLI. O bug estava em como os
dois comandos que chamam `executeBacklog` preenchiam esse campo:

- `src/commands/run.ts`: `autoAdvanceStages: Boolean(opts.autoAdvanceStages)`
- `src/commands/resume.ts`: `autoAdvanceStages: Boolean(pipeline.autoAdvance)`

`Boolean(undefined)` retorna `false` — um valor **definido** — entao toda
run iniciada sem a flag `--auto-advance-stages` (isto e, toda run disparada
pelo dashboard, que faz `spawn(... 'run', '--feature', featureId)` sem essa
flag em `src/web/server.ts`) passava `autoAdvanceStages: false` para
`executeStagedFeature`. `resolveAutoAdvance()` entao tratava esse `false`
como um override explicito e nunca chegava a checar o catalogo — o checkbox
ficava sem efeito algum, nao so durante uma run em andamento (cenario de
H20) mas para qualquer run iniciada pelo dashboard.

O mesmo padrao existia em `resume.ts`, que fixava o valor no `autoAdvance`
persistido no momento da criacao da pipeline, ignorando qualquer mudanca no
checkbox feita depois.

## Resolucao aplicada

- `src/commands/run.ts`: passa `opts.autoAdvanceStages` diretamente (sem
  `Boolean(...)`), preservando `undefined` quando a flag de CLI nao foi
  passada — deixa `resolveAutoAdvance()` cair no catalogo/config default.
- `src/commands/resume.ts`: para de derivar `autoAdvanceStages` de
  `pipeline.autoAdvance` (snapshot potencialmente desatualizado); passa
  `undefined`, deixando resume re-checar o catalogo por transicao como uma
  run nova.
- `tests/commands/commands.test.ts`: assercoes de `run`/`resume` sem a flag
  de CLI atualizadas para esperar `autoAdvanceStages: undefined` em vez de
  `false`.

## Testes

- `rtk npm run build`, `rtk npm test` (878 testes), `rtk npm run typecheck`
  e `rtk npm run lint` passam.

## Criterios de aceite

- [x] Run disparada pelo dashboard (`msq run --feature X`, sem flag de CLI)
      respeita o checkbox `autoAdvance` do catalogo em toda transicao de
      stage, nao so na primeira
- [x] `resume` tambem re-checa o catalogo por transicao em vez de congelar o
      valor de `autoAdvance` capturado na criacao da pipeline
- [x] `--auto-advance-stages` como override explicito de CLI continua com
      prioridade absoluta quando de fato passado
- [x] `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck`,
      `rtk npm run lint` passam

## Notas

- Este bug mascarava o efeito pratico de H20: a re-leitura do catalogo a
  cada transicao (H20) so importa quando `opts.autoAdvanceStages` chega
  `undefined` ao `executeStagedFeature`; H21 e o que garante que isso
  aconteca no caminho real usado pelo dashboard.
