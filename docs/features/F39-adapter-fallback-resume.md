# F39 — Fallback de tool/model em retry + resume no step que falhou

**Epic**: E03 — Orchestration v2 (mesma linha de F11 retry, F14 budget, F26 resume)
**Prioridade**: Alta
**Esforco**: High
**Depende de**: F11 (retry policies), F14 (budget caps), F26 (resume de pipeline)

## Problema

Hoje, quando um adapter falha (crash do processo, timeout, rate limit do provider) ou
estoura um limite de budget (`maxTokens` global ou `perFeatureMaxTokens`), o `msq`:

- so sabe reexecutar a feature com o **mesmo** `tool`/`model` (`runWithRetry` em
  `src/core/runner/execute.ts:456-493` resolve `getAdapter(feature.tool)` uma unica
  vez antes do loop de tentativas);
- quando o budget estoura, apenas pausa a pipeline ou cria um gate manual
  (`src/core/runner/execute.ts:136-166`, `src/core/budget/tracker.ts`), sem oferecer
  caminho de continuar com outra ferramenta;
- ao reexecutar via `msq resume <target>`, reconstroi o estado a partir do snapshot
  persistido (`done/pending/active/aborted` em `pipelines`, ver F26), mas nao ha forma
  de dizer "continue essa run especifica, porem com outro tool/model, apenas no
  step que ficou pendente";
- o `runs.total_tokens` e sobrescrito a cada chamada de `updateRunUsage()`
  (`src/db/repo.ts:99-105` faz `UPDATE runs SET input_tokens = ?, ...`, nao soma) —
  entao se uma tentativa falha e outra e refeita no mesmo `runId`, o custo real
  acumulado (incluindo a tentativa que falhou) nao fica visivel na tabela `runs`,
  apenas espalhado em linhas avulsas de `token_usage`.

Na pratica: se `codex` falha ou estoura budget no meio do stage `implement`, o
operador nao consegue dizer "continue com `claude`, effort medium, a partir desse
mesmo stage" sem perder o historico de tokens ja gastos nem sem repetir stages
(`specify`/`plan`/`tasks`) que ja tinham sido concluidos com sucesso.

## Objetivo

Permitir que, quando uma feature falha (esgotou `retry.maxAttempts`) ou atinge um
limite de budget, o operador possa trocar `tool` e/ou `model`/`effort` e retomar
**a mesma run/pipeline**, reexecutando **somente o step (stage/task) que ficou
pendente**, sem gerar uma run nova do zero e sem perder o rastreio de tokens —
incluindo os tokens já gastos pela tentativa que falhou.

## Solucao

### 1. Fallback de tool/model no retry (`backlog.yaml`)

Estender `RetrySchema` (`src/core/backlog/schema.ts:8-12`) com uma lista opcional
`fallback`, tentada em ordem apos `maxAttempts` do `tool` primario se esgotarem:

```yaml
retry:
  maxAttempts: 2
  backoffMs: 5000
  onFail: gate
  fallback:
    - tool: claude
      effort: medium
      maxAttempts: 1
    - tool: opencode
      maxAttempts: 1
```

- Cada entrada de `fallback` aceita `tool` (obrigatorio), `model`/`effort`
  (opcionais, herdam da feature se omitidos) e `maxAttempts` proprio (default 1).
- `runWithRetry` passa a iterar uma lista de "attempt specs" (`tool` primario +
  fallbacks), resolvendo `getAdapter(spec.tool)` por spec e construindo um `Feature`
  efetivo (clone com `tool`/`model`/`effort` sobrescritos) para passar a
  `adapter.runFeature(...)` — sem mutar o `feature` original compartilhado pelo
  scheduler.
- `retry_history` (`src/db/index.ts:143-149`) ganha colunas `tool` e `model` para
  registrar qual adapter foi usado em cada tentativa.

### 2. Budget-triggered fallback

Quando `budget.record()` detecta violacao (`src/core/runner/execute.ts:136-166`,
`src/core/budget/tracker.ts:113-156`), hoje o unico desfecho e pausar/gate. Este
fallback de tool passa a ser um dos caminhos de resolucao do gate: ao resolver o
gate de budget, o operador pode informar `tool`/`model` para a proxima tentativa,
reaproveitando a mesma infraestrutura do item 1 (nao precisa outro mecanismo).

### 3. Resume no step que falhou, sem recriar a run

Estender `msq resume <target>` (`src/commands/resume.ts`) com flags opcionais:

```bash
msq resume <run-id|feature-id|repo-id> --tool claude --model claude-sonnet-5
msq resume <run-id|feature-id|repo-id> --effort medium
```

- O override e aplicado **apenas a essa retomada** (nao reescreve `backlog.yaml`
  nem o catalogo persistido) — persistido como override pontual na linha da
  `pipeline`/`run` retomada.
- Reaproveita `determineStageStartIndex` (`src/core/runner/execute.ts`) e o
  snapshot de `pipelines` (F26) para retomar exatamente no stage/task onde parou:
  stages `done` no workflow staged (`specify`/`plan`/`tasks`/...) **nao sao
  re-executados**; apenas o stage que estava `running`/`failed` no momento da
  interrupcao roda de novo, agora com o adapter/model override.
- Nenhuma nova run e criada para o trabalho ja concluido: o `resume` continua
  usando o mesmo `runId`/`pipelineId` da execucao original, criando apenas o
  registro de tentativa (retry/run) para o step que efetivamente sera reexecutado.

### 4. Contabilizacao correta de tokens entre tentativas/tools

`updateRunUsage()` (`src/db/repo.ts`) continua sobrescrevendo
`runs.input_tokens/output_tokens/total_tokens` a cada chamada (snapshot da
ultima tentativa) — isso nao foi alterado, pra nao arriscar quebrar outros
consumidores de `runs.total_tokens` (budget/TUI) que esperam o valor da
tentativa mais recente. Em vez disso, o total acumulado real e exposto via
uma nova leitura:

- `getRunAccumulatedTokens(runId)` (`src/db/repo.ts`) roda
  `SELECT SUM(total) FROM token_usage WHERE run_id = ?` — `token_usage` ja e
  append-only por tentativa, entao a soma cobre a(s) tentativa(s) que
  falharam antes do fallback ser acionado sem precisar de coluna nova.
- `msq status` (`src/commands/status.ts`) usa essa soma na tabela de
  "Attempt history" por run, ao lado de `retry_history` (`tool`/`model` por
  tentativa via `listRetryHistory`); a tabela principal de runs continua
  mostrando `runs.total_tokens` (ultima tentativa) sem mudanca de
  comportamento.
- `task_runs`/`stats.ts`/`budget/tracker.ts` nao foram tocados nesta feature —
  ficam fora do escopo, pois nenhum FR exigiu revisao desses agregados.

## Escopo tecnico

- `src/core/backlog/schema.ts`: `RetrySchema` ganha `fallback` (array opcional de
  `{ tool, model?, effort?, maxAttempts? }`).
- `src/core/runner/execute.ts`: `runWithRetry` passa a iterar attempt specs
  (primario + fallback) em vez de um unico adapter fixo; constroi `Feature`
  efetivo por tentativa sem mutar o objeto compartilhado.
- `src/db/index.ts` / `src/db/repo.ts`: `retry_history` ganha colunas `tool`/
  `model`; nova `getRunAccumulatedTokens(runId)` soma `token_usage` por
  `run_id` para expor o total real gasto (incluindo tentativas falhas) sem
  alterar `updateRunUsage()`/`runs.total_tokens`.
- `src/commands/resume.ts`: novas flags `--tool`, `--model`, `--effort` aplicadas
  como override pontual da retomada, sem persistir no `backlog.yaml`.
- `src/core/orchestrator/scheduler.ts` / `execute.ts` (staged workflow): garantir
  que o resume com override de tool só re-executa o stage/task pendente,
  reaproveitando `determineStageStartIndex` e o snapshot de `pipelines`.
- TUI/`msq status`: expor qual `tool`/`model` foi usado em cada tentativa
  (leitura de `retry_history`) e o total de tokens acumulado da run, incluindo
  tentativas com tool trocado.

## Criterios de aceite

- [x] Uma feature com `retry.fallback` configurado, ao esgotar `maxAttempts` no
      tool primario, tenta automaticamente o proximo tool da lista antes de
      aplicar `onFail`.
- [x] `msq resume <target> --tool <outro> --model <outro>` retoma a mesma
      run/pipeline, sem criar uma run nova para o trabalho ja concluido.
- [x] Ao retomar apos falha, apenas o stage/task que tinha falhado e
      reexecutado — stages ja `done` no workflow staged nao rodam de novo.
- [x] O total de tokens exibido em `msq status` (tabela "Attempt history" por
      run, via `getRunAccumulatedTokens`) inclui os tokens gastos pela(s)
      tentativa(s) que falharam antes do fallback, nao apenas a tentativa
      final bem-sucedida — `runs.total_tokens` em si continua refletindo
      apenas a ultima tentativa.
- [x] `retry_history` registra `tool`/`model` usados em cada tentativa,
      permitindo auditar exatamente quando e para onde houve fallback.
- [x] Existe teste cobrindo: tentativa 1 falha com `codex`, fallback para
      `claude`/effort medium sucede, e o total de tokens reportado soma as duas
      tentativas.
