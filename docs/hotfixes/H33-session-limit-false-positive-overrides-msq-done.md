# H33 — `detectSessionLimit` marca run bem-sucedida como "session limit reached", ignorando um `MSQ_DONE` válido

## Sintoma

Run #384 de `F-QKTGR286` (2026-07-20 17:23:57–17:27:21, adapter `claude`)
terminou com `session_status = 'completed'` (processo saiu com código 0) e o
último trecho de output do agente contém um `MSQ_DONE` completo e bem
formado, com `pr_url`/`pr_number`/`base`/`head` apontando para o PR #227 já
aberto contra `develop`. Mesmo assim o `msq` marcou a run como
`status = 'failed'`, `summary = "session limit reached: session limit"`, e a
pipeline #277 ficou `paused` — sem nunca tentar o reforço de protocolo
(`attemptProtocolReinforcement`, ver H26) nem reconhecer a entrega como
concluída. O PR #227 em si estava correto; só o bookkeeping da run/pipeline
no `msq` ficou errado.

## Causa raiz

`detectSessionLimit` (`src/core/adapters/types.ts`) escaneia o
`stdout`+`stderr` **combinado e inteiro** da transcript com regexes
genéricas (`/session limit/i`, `/rate limit/i`, `/quota exceeded/i`, etc.),
sem se restringir a uma mensagem de erro real do provider/CLI. Em
`claude.ts`, `codex.ts` e `opencode.ts` essa checagem rodava **antes** de
`findResultEvent`/`parseControlSignal` (ou equivalente) processar o sinal de
controle do protocolo (`MSQ_DONE`/`MSQ_BLOCKED`/`MSQ_INPUT_REQUIRED`).

Na run #384, o agente rodou `git log` antes de finalizar, e o output desse
tool call incluía o commit `0767d46 feat(notify): suggest and enable adapter
fallback resume on Telegram session limit (#218)` — a substring "session
limit" apareceu ali, sem nenhuma relação com um limite de uso real. Como a
checagem por regex não distingue "menção incidental em output de tool call"
de "erro real do provider", ela disparou um falso positivo, e o adapter
retornou `{ ok: false, blocked: true, summary: 'session limit reached: ...' }`
antes mesmo de olhar o `MSQ_DONE` genuíno que vinha depois na mesma
transcript.

Esse falso positivo tinha um efeito colateral crítico: como o resultado do
adapter já vinha com `ok: false`, o runner (`src/core/runner/execute.ts`)
nunca entrava no branch de reforço de protocolo (`if (res.ok &&
!declaredDone)`, ~linha 507), que é o mecanismo que reinicia a mesma sessão
lembrando o contrato quando o agente termina sem declarar `MSQ_DONE` (H26).
A run caía direto no branch genérico de falha e virava `status: 'failed'`.

## Correção

Em `claude.ts`, `codex.ts` e `opencode.ts`, o sinal de controle do protocolo
(`parseControlSignal` sobre a mensagem final real do agente) passa a ser
calculado **antes** da checagem de `detectSessionLimit`. Um sinal de
controle bem formado (`done`/`blocked`/`needs_input`) é prova direta de que
a sessão fechou corretamente, então ele tem prioridade sobre a heurística de
texto — que só roda como fallback quando não há controle nenhum (cenário em
que a run realmente parece ter parado sem se explicar, e vale a pena checar
se foi por limite de sessão). `usage`/`session` também passaram a ser
computados antes dessa decisão, então o branch de bloqueio genuíno agora
também carrega `usage`/`session`, o que não acontecia antes.

O caminho de saída com código de processo diferente de zero (`code !== 0`)
não foi alterado: ali a detecção de limite continua sendo a primeira
tentativa de explicação, já que um crash real do processo raramente deixa
uma transcript completa/parseável para extrair um controle confiável.

## Validação

- Testes novos cobrindo exatamente o cenário reproduzido (controle válido +
  menção benigna de "session limit" em output de tool call não deve
  bloquear; ausência de controle + menção real de limite continua
  bloqueando):
  - `tests/adapters/claude.test.ts` (arquivo novo — não havia nenhum teste
    dedicado ao adapter `claude` antes)
  - `tests/adapters/codex-extended.test.ts` (`codexAdapter.runFeature —
    success path`)
  - `tests/adapters/opencode.test.ts` (`opencodeAdapter.runFeature`)
- `rtk npx vitest run tests/adapters/claude.test.ts tests/adapters/codex.test.ts tests/adapters/codex-extended.test.ts tests/adapters/opencode.test.ts tests/adapters/misc.test.ts tests/adapters/types.test.ts tests/adapters/spawn.test.ts tests/adapters/registry-reference.test.ts`
- baseline: `rtk npm run build`, `rtk npm test` (1562 testes), `rtk npm run typecheck`, `rtk npm run lint`.

Não foi alterado o comportamento do caminho `code !== 0`, então não foi
adicionada cobertura nova para ele — o risco identificado e reproduzido foi
específico do caminho de saída bem-sucedida (`code === 0`).
