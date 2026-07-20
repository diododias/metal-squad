# H30 — Adapter `claude` ignora o timeout configurável e mata runs ativas aos 10min

## Sintoma

`F-QKTGR286` (PRJ-26, branch `feat/prj26-workflow-templates-ui`) caiu em
`blocked` na run #379 (stage `implement`, tool `claude`). O histórico do
`runs`/`run_events` mostra a run sendo morta por `SIGKILL` aos 600000ms
(±22ms) de wall-clock, no meio da escrita de um arquivo grande
(`WorkflowTemplateEditor.tsx`), com o processo ativamente produzindo output —
não estava `idle`. `SELECT tool, count(*) FROM runs WHERE session_status =
'timed_out' GROUP BY tool` mostra 9 ocorrências históricas, todas no adapter
`claude`; nenhuma em `codex`/`opencode`.

## Causa raiz

`runCli` (`src/core/adapters/spawn.ts:148`) usa
`const timeoutMs = opts.timeoutMs ?? 600_000;` e dispara um `setTimeout` fixo
desde o início do processo (`spawn.ts:189-204`) que mata a run nesse prazo,
independente de atividade — é um teto de wall-clock, não um idle-timeout (o
idle é detectado separadamente via `idleThresholdMs`, sem relação com o kill).

`src/core/adapters/codex.ts:102-114` calcula corretamente
`Math.max(runtime.toolTimeoutMs, invocation.minTimeoutMs)` a partir da config
(`resolveRuntimeConfig`) e do piso por tool no registry, passando o resultado
para `runCli`. `src/core/adapters/claude.ts` e `src/core/adapters/opencode.ts`
nunca passavam `timeoutMs` na chamada de `runCli` — caíam sempre no default
hardcoded de `spawn.ts`. Isso tornava `toolTimeoutMs` (config global/repo) e
`minTimeoutMs` (piso por tool no `DEFAULT_TOOL_REGISTRY`,
`src/config/index.ts`) letra morta para esses dois adapters: não havia como
configurar um timeout maior para `claude`, mesmo setando `.msq/config.yaml`.

## Correção

- `src/core/adapters/claude.ts` e `src/core/adapters/opencode.ts` agora
  calculam `timeoutMs = Math.max(runtime.toolTimeoutMs, invocation.minTimeoutMs)`
  e passam para `runCli`, no mesmo padrão de `codex.ts`.
- `DEFAULT_TOOL_REGISTRY` (`src/config/index.ts`), entry `id: 'claude'`: piso
  `minTimeoutMs` subiu de `0` para `3_600_000` (60min), garantindo esse
  mínimo por padrão sem exigir `.msq/config.yaml` por repo — mesmo padrão do
  `codex` (`minTimeoutMs: 1_800_000`). `opencode` manteve `minTimeoutMs: 0`
  (sem histórico de timeout que justifique um piso especial); passa a
  respeitar `toolTimeoutMs` da config, que antes também era ignorado.

Para configurar um valor diferente por repo, `toolTimeoutMs` em
`.msq/config.yaml` (`runtime:`) continua funcionando e agora tem efeito real
em todos os três adapters — `Math.max` garante que o piso do tool nunca é
furado por uma config menor.

## Validação

- `rtk npx vitest run tests/adapters/misc.test.ts tests/adapters/opencode.test.ts tests/adapters/codex.test.ts tests/config/index.test.ts` — 86 testes, novos casos cobrindo `timeoutMs` calculado para `claude` e `opencode` (piso do registry vs. config maior vencendo).
- baseline: `rtk npm run build`, `rtk npm test` (1534 testes), `rtk npm run typecheck`, `rtk npm run lint` — todos limpos.
