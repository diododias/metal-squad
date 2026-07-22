# H31 — Timeout de run nunca dispara notificação (Telegram/etc.)

## Sintoma

Nenhuma das runs que travaram por timeout (`session_status = 'timed_out'`)
gerou notificação — nem Telegram, nem qualquer outro canal configurado.
Confirmado no banco: `SELECT count(*) FROM timeout_occurrences` = `0`,
mesmo havendo 9 runs históricas com `session_status = 'timed_out'` (incluindo
a run #379 de `F-QKTGR286`, investigada em H30). O problema não é específico
de uma feature ou adapter — a pipeline de notificação de timeout nunca
funcionou em nenhum caso registrado.

## Causa raiz

`upsertRunSessionStatus` (`src/db/repo.ts`) é chamado a cada evento
`run:status` emitido por `runCli` (`src/core/adapters/spawn.ts`), inclusive
`emitStatus('timed_out', ...)` disparado no instante em que o timer de
timeout mata o processo. Essa função calculava um `legacyStatus` para manter
a coluna antiga `runs.status` sincronizada com `session_status`, e mapeava
`timed_out` diretamente para `'failed'`:

```
snapshot.status === 'failed' || snapshot.status === 'timed_out' ? 'failed' : null
```

O `UPDATE` resultante grava `runs.status = 'failed'` **imediatamente**,
antes mesmo da `CliTimeoutError` ser lançada/capturada pelo adapter e do
fluxo voltar pra `src/core/runner/execute.ts`.

Só depois disso `execute.ts` (linha ~390, bloco `if (res.timeout)`) chama
`createTimeoutOccurrence(...)` para registrar a ocorrência — e só se ela for
criada com sucesso, `createTimeoutApprovalRequest` roda e
`msqEventBus.emit('timeout:approval-created', ...)` é disparado. Esse é o
único evento que `dispatch()` (`src/core/notify/manager.ts:45`) trata como
prioritário, ignorando a config de `notifications.events` — é o que
efetivamente manda a mensagem pro Telegram/Slack/etc.

Só que `createTimeoutOccurrence` (`src/db/repo.ts`) tem uma guarda:

```
if (!run || ['done', 'failed', 'aborted'].includes(run.status ?? '')) return null;
```

Como `upsertRunSessionStatus` já tinha marcado `status = 'failed'` no passo
anterior — para a MESMA transição de timeout, não por uma causa
independente — essa guarda sempre batia, `createTimeoutOccurrence` retornava
`null`, `createTimeoutApprovalRequest` nunca era chamado, e o bloco que
emitiria `timeout:approval-created` era pulado inteiro. `finishRun(runId,
'blocked', ...)` continuava marcando a run como `blocked` corretamente (por
isso `runs.status` aparecia como `blocked`, não `failed`, na consulta final),
mas a notificação nunca era sequer tentada.

Além da corrida, o mapeamento em si era semanticamente errado: uma run que
deu timeout não é necessariamente "failed" — quem decide isso é o
`execute.ts`, que normalmente marca `blocked` (pendente de decisão humana
via timeout-approval), não `failed`.

## Correção

`upsertRunSessionStatus` (`src/db/repo.ts`) não mapeia mais `timed_out` para
`'failed'`; o `legacyStatus` fica `null` nesse caso, então o `CASE WHEN`
deixa `runs.status` intacto (ainda `'running'`) até o `finishRun` explícito
de `execute.ts` decidir o valor final. `failed`, `completed` e `interrupted`
continuam mapeando normalmente — não são afetados por essa corrida porque
`execute.ts` só os classifica como terminais quando já são de fato terminais
por conta própria.

## Validação

- `rtk npx vitest run tests/db/repo-extended.test.ts` — cobertura nova para
  `upsertRunSessionStatus` (não existia nenhuma antes): confirma que
  `timed_out` não força mais `status='failed'`, e que `failed`/`completed`/
  `interrupted` continuam mapeando como antes.
- baseline: `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck`, `rtk npm run lint`.

Não foi adicionado teste de integração ponta a ponta
(`execute.ts` → `createTimeoutOccurrence` → `dispatch`) porque a combinação
dos testes de `upsertRunSessionStatus` (não força mais `status='failed'`) com
os testes já existentes de `createTimeoutOccurrence` (`tests/db/repo-extended.test.ts`,
sucesso quando `status='running'` / `null` quando já terminal) já prova o
contrato de ponta a ponta sem duplicar mocks pesados do runner.
