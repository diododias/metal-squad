# Quickstart validation — F55

## Prerequisites

```bash
npm install
npm run build
```

Para experimento manual, use DB isolada:

```bash
MSQ_DB_PATH="$PWD/.metal-squad/f55-test.db" npm run migrate:db
```

Testes não devem usar token Telegram real; devem mockar `fetch`, secret lookup
e associação de tópico, como as suites atuais de Telegram.

## Focused validation

```bash
npx vitest run \
  tests/core/notify-telegram-poller.test.ts \
  tests/core/events-notifications-full.test.ts \
  tests/core/notify-telegram-topics.test.ts \
  tests/db/repo.test.ts tests/db/repo-extended.test.ts
```

Adicionar suites focadas de runner/adapter para provar:

1. timeout tipado persiste uma ocorrência/request, bloqueia run/pipeline e
   publica uma mensagem única no tópico com as duas ações e contexto;
2. Retry resolve uma vez, cria uma única tentativa no estágio afetado e mantém
   checkpoints; Keep blocked e ausência de resposta nunca iniciam retry;
3. callbacks duplicados/tardios, chat/tópico incorreto, cancelamento e corrida
   com sucesso confirmado são no-ops;
4. falha de Telegram registra entrega `failed`, mantém request pendente e não
   aprova; gates, inputs, notificações globais e falhas não-timeout permanecem
   iguais.

## Repository gates

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Live/QA evidence for implementation stage

Na implementação, usar o fluxo QA `msq-develop`: rebuild imediatamente antes de
`msq run`, `MSQ_DB_PATH` gravável e isolada quando necessário, sem implementar
manualmente a feature alvo nem iniciar runner aninhado. Aceitar o fluxo somente
com dois sinais concretos, por exemplo rows persistidas de timeout/request/
pipeline e eventos/heartbeat úteis. Conferir `msq status` e o DB para provar uma
única tentativa e retomada no estágio afetado.

## Implementation evidence

Executed in this checkout:

```text
npx vitest run focused adapter, database, event, Telegram, and runner suites
  8 files passed, 138 tests passed

npm test
  72 files passed, 1026 tests passed

npm run typecheck
  passed

npm run lint
  passed

MSQ_DB_PATH="$PWD/.metal-squad/f55-test.db" npm run build
  schema migrated successfully; TypeScript/web build passed
```

The global database migration was not writable in the sandbox, so the build
migration used the documented local `MSQ_DB_PATH` override. No Telegram token
or external delivery was used.
