# H35 — `detectSessionLimit` restrito à cauda do output, não à transcript inteira

## Sintoma

A run 384 (`F-QKTGR286`, 2026-07-20) foi originalmente mal classificada como
`failed`/`session limit reached` pelo bug descrito em
`docs/hotfixes/H33-session-limit-false-positive-overrides-msq-done.md`: um
`git log` executado pelo agente trouxe, no meio da transcript, o commit
`0767d46 feat(notify): suggest and enable adapter fallback resume on Telegram
session limit (#218)` — uma menção incidental à string "session limit" sem
relação com um limite real de uso.

H33 corrigiu a **ordem** de checagem no caminho de saída bem-sucedida
(`code === 0`): agora um `control` signal (`MSQ_DONE`/`MSQ_BLOCKED`) bem
formado tem prioridade sobre a heurística de texto. Mas isso deixou dois
pontos ainda vulneráveis ao mesmo tipo de falso positivo:

1. o **fallback** do caminho `code === 0` quando não há `control` (por
   qualquer motivo, o parse do sinal falhar);
2. o caminho `code !== 0`, que nunca teve prioridade de `control` para
   desviar — ali `detectSessionLimit` sempre foi a primeira tentativa de
   explicação.

Em ambos, `detectSessionLimit` (`src/core/adapters/types.ts`) escaneava o
`stdout+stderr` combinado **inteiro** com as regexes de
`SESSION_LIMIT_PATTERNS`, então qualquer menção incidental em qualquer ponto
da transcript — não só no final — podia disparar o bloqueio.

## Causa raiz

Um erro real de limite de sessão/rate limit/quota é sempre a **última** coisa
que o CLI imprime antes de sair; não faz sentido varrer a transcript inteira
em busca dele. `detectSessionLimit` tratava "menção em qualquer lugar" como
equivalente a "erro real ao final", o que é a mesma classe de falso positivo
do H33, só que sobrevivendo no fallback e no caminho de erro de processo.

## Correção

`detectSessionLimit` (`src/core/adapters/types.ts`) agora concatena
`stdout+stderr`, remove espaço/quebras de linha finais (`trimEnd`) e só roda
as regexes contra os últimos `SESSION_LIMIT_TAIL_CHARS` (50) caracteres desse
resultado — a cauda real do que o processo imprimiu ao encerrar. Nenhum call
site precisou mudar: `claude.ts`, `codex.ts` e `opencode.ts` (dois pontos de
chamada cada, no caminho `code !== 0` e no fallback sem `control`) continuam
chamando a mesma assinatura `detectSessionLimit(stdout, stderr)`.

Isso é complementar ao H33, não um substituto: H33 garante que um `control`
válido nunca é ofuscado pela heurística; H35 garante que, mesmo quando a
heurística roda (fallback ou `code !== 0`), ela só considera o trecho onde um
erro real plausivelmente apareceria.

## Validação

- Cobertura nova e direta da função em `tests/adapters/types.test.ts`
  (`describe('detectSessionLimit (H35 — tail-only scan)')`): erro genuíno no
  final do `stderr` é detectado; menção incidental no meio de uma transcript
  longa é ignorada; erro genuíno como última linha do `stdout` (sem
  `stderr`) é detectado; espaço/quebras de linha finais não escondem o erro
  real.
- Suítes existentes de regressão do H33 continuam verdes sem alteração:
  `tests/adapters/claude.test.ts`, `tests/adapters/codex-extended.test.ts`,
  `tests/adapters/opencode.test.ts`.
- `rtk npx vitest run tests/adapters/types.test.ts tests/adapters/claude.test.ts tests/adapters/codex.test.ts tests/adapters/codex-extended.test.ts tests/adapters/opencode.test.ts tests/adapters/misc.test.ts tests/adapters/spawn.test.ts tests/adapters/registry-reference.test.ts` — 165 testes.
- baseline: `rtk npm run build`, `rtk npm test` (1568 testes), `rtk npm run typecheck`, `rtk npm run lint`.
