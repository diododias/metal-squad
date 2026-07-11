# H12 — Feature falhada com `onFail: stop` some do snapshot; TUI nao mostra como retomar

**Tipo**: Hotfix
**Status**: Concluido
**Prioridade**: Alta
**Descoberto em**: 2026-07-11
**Comando observado**: `msq run`/`msq ui` com uma feature usando `retry.onFail: stop` (padrao)

## Problema

Ao falhar uma feature com a politica padrao `onFail: stop`, a pipeline
terminava com status `'failed'` mas nenhuma indicacao de resume aparecia — nem
na TUI, nem a pipeline era listada por `msq resume` quando essa era a unica
feature ainda pendente.

## Causa raiz

Duas causas distintas, uma na TUI e uma no snapshot persistido:

1. `src/ui/App.tsx` (`canResume`) so considerava `pipelineStatus === 'paused'`
   como retomavel. Isso esta correto para o hotkey `r resume` em si — ele so
   funciona porque, em `'paused'`, o processo `msq run` original ainda esta
   vivo e com o `controlPoller` (`src/core/runner/execute.ts`) escutando a
   mudanca de status no banco. Para `'failed'`/`'blocked'`/`'aborted'` esse
   processo ja terminou; nao ha nada escutando, entao simplesmente flipar o
   status no banco nao teria efeito nenhum. A TUI tambem nao mostrava nenhuma
   alternativa (ex.: o comando `msq resume` equivalente).
2. `src/core/runner/execute.ts` (`onDone` do scheduler): quando uma feature
   falha e `getOnFailPolicy(feature)` nao e `'continue'` (isto e, `'stop'` — o
   default, ou `'gate'` antes de H11 mover esse caso para `pending`/`paused`),
   o `updatePipelineSnapshot` removia a feature de `pending` e de `aborted` sem
   adiciona-la a nenhuma outra lista. A feature desaparecia dos quatro buckets
   (`pending`/`active`/`done`/`aborted`) do snapshot da pipeline. Isso quebrava
   tanto `listResumablePipelines`/`findResumablePipeline`
   (`src/db/repo.ts`) quanto a reconstrucao de trabalho pendente ao chamar
   `msq resume <target>` — nao havia registro de que essa feature ainda
   precisava rodar.

## Resolucao aplicada

- `src/core/runner/execute.ts`: uma falha que nao conta como `done` (`onFail:
  stop`, ou `gate` fora do caminho ja coberto por H11) agora entra no bucket
  `aborted` do snapshot — o mesmo bucket ja usado para "trabalho interrompido
  que precisa reexecutar" — em vez de sumir de todas as listas.
- `src/db/repo.ts` (`listResumablePipelines`): a clausula `WHERE status IN
  (...)` passa a incluir `'failed'` e `'blocked'` explicitamente, alem da
  checagem ja existente de `pending_json`/`aborted_json` nao vazios, como
  camada extra de seguranca.
- `src/ui/components/MainPanel.tsx` (secao "Run Summary"): quando
  `pipelineStatus` e `'failed'`, `'blocked'` ou `'aborted'`, exibe uma dica com
  o comando equivalente (`msq resume <pipelineId> --tool <tool> --model
  <model>`) em vez de nada. O hotkey `r resume` continua restrito a
  `'paused'` (unico estado em que o flip de status tem efeito real), pois a UI
  nao deve spawnar processos (`.claude/rules/architecture.md`).

## Testes

- `tests/runner/execute.test.ts` (`retries up to maxAttempts before failing`):
  nova asserção verificando que a feature falhada aparece em
  `pipelineRow.abortedJson` (nao em `doneJson`) apos o teste existente de
  esgotar tentativas com `onFail: stop`.

## Criterios de aceite

- [x] Uma feature com `onFail: stop` (default) que esgota tentativas deixa o
      snapshot da pipeline com a feature no bucket `aborted`, nao ausente de
      todos os buckets
- [x] `msq resume <target>` encontra a pipeline mesmo quando o unico trabalho
      pendente e essa feature falhada
- [x] A TUI mostra o comando de resume equivalente para pipelines
      `failed`/`blocked`/`aborted`, mesmo sem reativar o hotkey `r resume`
      (que so funciona com processo vivo, estado `paused`)
- [x] `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck` e
      `rtk npm run lint` passam (822 testes)

## Notas

- F39 (`docs/features/F39-adapter-fallback-resume.md`) ja implementou `msq
  resume --tool/--model/--effort`; este hotfix corrige um caso em que a
  pipeline sequer aparecia como candidata a resume porque a feature falhada
  tinha sumido do snapshot.
- H11 (`docs/hotfixes/H11-onfail-gate-not-pausing-pipeline.md`) ja havia
  corrigido o caminho equivalente para `onFail: gate` (a feature volta a
  `remaining` do scheduler e a pipeline pausa de verdade). Este hotfix cobre o
  caminho de `onFail: stop`, que rejeita a promise do scheduler em vez de
  pausar, e por isso precisa do fix no snapshot em vez de no scheduler.
