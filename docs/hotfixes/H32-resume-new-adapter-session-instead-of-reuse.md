# H32 — Retomar uma run bloqueada cria sessão nova em vez de continuar via `--resume`

## Sintoma

Uma feature single-stage bloqueou por timeout. Ao retomar (via `msq resume
<pipelineId>`, seja em processo novo ou via re-dispatch do scheduler no mesmo
processo), o `claude` foi invocado com `--session-id <uuid novo>` em vez de
`--resume <sessionId anterior>` — o agente perdeu todo o contexto acumulado
antes do bloqueio e recomeçou do zero.

## Causa raiz

`adapter.runFeature(...)` (claude/codex/opencode) pode devolver `res.session`
(`SessionHandle` com o id real do CLI), mas esse handle só existia **em
memória**, dentro da chamada/processo atual. A única persistência de
sessionId em SQLite era `stage_transition_decisions.next_session_id`, usada
só para telemetria/exibição, nunca relida para reconstruir sessão. A tabela
`runs` tinha colunas `session_*`, mas todas sobre heartbeat/status do
processo (idle, elapsed, terminal) — nenhuma com o `sessionId` real do
adapter.

Quando uma feature bloqueava de verdade (timeout, "sem MSQ_DONE", gate por
falha, `needs_input` abandonado) e era retomada — `msq resume` em processo
novo ou re-dispatch do scheduler no mesmo processo
(`src/core/orchestrator/scheduler.ts`, que recoloca a feature em `remaining`
e só a redispara quando `resume()` é chamado) — a função que chama o adapter
de novo (`executeStagedFeature` para staged, o branch single-stage dentro de
`execute()` para não-staged, ambos em `src/core/runner/execute.ts`) começava
com uma variável local `nextStageSession`/`nextSession` sempre `undefined`.
Nada a inicializava a partir de dado persistido.

Além disso, especificamente para timeout: os 3 adapters nem chegavam a
devolver `res.session` nesse branch — `CliTimeoutError`
(`claude.ts`/`codex.ts`/`opencode.ts`) retornava direto sem tentar montar o
`SessionHandle`, diferente do caminho de sucesso.

## Correção

- `runs` ganhou duas colunas (`adapter_session_tool`, `adapter_session_id`,
  `src/db/index.ts`) e `src/db/repo.ts` ganhou
  `updateRunSessionHandle`/`getLatestRunSessionHandle` para persistir e
  reler o `SessionHandle` real por `(pipelineId, featureId, stage)`.
- Os 3 adapters agora também tentam montar `session` no branch de timeout,
  reaproveitando os builders já usados no caminho de sucesso
  (`buildClaudeSessionHandle`/`buildCodexSessionHandle`/
  `buildOpenCodeSessionHandle`) sobre o stdout parcial.
- `src/core/runner/execute.ts` persiste `res.session` a cada resultado
  (dentro de `executeStageRun`) e semeia a sessão inicial ao (re)tentar um
  estágio — tanto em `executeStagedFeature` (staged) quanto no branch
  single-stage de `execute()` — buscando o handle persistido para
  `(pipelineId, featureId, stage)` e comparando o `tool` com
  `resolvePrimaryTool(...)`.

Fora de escopo, deliberadamente: `src/core/workflow/sessionPolicy.ts`
(`decideStageTransition`, decisão de reuso **entre estágios** por
`contextWindowPercent`) não foi alterado — é um ponto de decisão diferente.
Bloqueio por "session limit reached" continua sempre gerando sessão nova,
porque os adapters nunca devolvem `res.session` nesse branch (nenhuma
mudança adicional foi necessária para preservar esse comportamento). Abort
manual (`CliAbortError`) também não foi tratado — não fazia parte do relato.

## Validação

- `rtk npx vitest run tests/runner/execute.test.ts tests/db/repo-extended.test.ts tests/db/index-migrate.test.ts tests/adapters/misc.test.ts tests/adapters/codex.test.ts tests/adapters/opencode.test.ts`
  — cobertura nova para persistência/leitura do `SessionHandle`, seed da
  sessão inicial em staged e single-stage (positivo, negativo e mismatch de
  tool), e captura de sessão no timeout dos 3 adapters.
- baseline completa: `rtk npm run build`, `rtk npm test` (1556 testes),
  `rtk npm run typecheck`, `rtk npm run lint`.

Não houve validação live ponta a ponta (feature real bloqueando por timeout
e sendo retomada via `msq resume`) nesta correção — a cobertura de testes
focados acima já prova o contrato em cada camada (adapter → persistência →
seed no resume) sem precisar reproduzir um timeout real de dezenas de
minutos.
