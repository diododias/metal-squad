# Quickstart: Validar Perguntas Interativas via Telegram (Botoes)

## Pre-requisitos

- `telegram-bot-token` configurado via `src/security/secrets.ts`
  (`getSecret('telegram-bot-token')`).
- `telegramChatId` (ou canal `telegram` em `notifications.channels`)
  configurado em `msq init` / config local (`src/config/index.ts`).
- Evento `stage:input` incluido em `notifications.events` (ja e default —
  ver `DEFAULT_NOTIFICATION_EVENTS` em `src/config/index.ts`).
- Build atualizado: `rtk npm run build`.

## Cenario 1 — Pergunta com opcoes discretas vira botoes (US1, FR-001..FR-004)

1. Rode o baseline de testes focados desta feature (nao precisa de run
   live de IA para validar a extracao — ver secao "Validacao por teste"
   abaixo).
2. Para validacao end-to-end real (opcional, exige credenciais Telegram):
   dispare um `msq run` para uma feature cujo stage `specify` seja
   instruido a emitir:
   ```
   MSQ_INPUT_REQUIRED: Qual estrategia de cache devemos usar?
   OPTIONS:
   - Cache em memoria
   - Cache em SQLite
   - Sem cache por enquanto
   ```
3. **Esperado**: mensagem chega no Telegram com o texto da pergunta e 3
   botoes (um por opcao, rotulos identicos ao output da IA).
4. Toque em um botao.
5. **Esperado**: `stage_requests` (via `msq status` ou consulta direta)
   mostra o pedido `resolved` com `response` igual ao rotulo tocado; o
   step em execucao continua como continuaria com a resposta em texto
   livre equivalente.

## Cenario 2 — Aprovacao de gate sem regressao (US2, FR-005)

1. Dispare (ou aguarde) um stage sem `MSQ_INPUT_REQUIRED:` no output,
   chegando ao ponto de aprovacao normal (`kind: 'approval'`).
2. **Esperado**: notificacao chega no formato atual (Advance/Retry/Hold),
   sem qualquer opcao "inventada" de pergunta.

## Cenario 3 — Pergunta longa e dividida em mensagens (US3, FR-006)

1. Gere (ou simule via teste unitario de `TelegramChannel.send`) um texto
   de pergunta > 4096 caracteres.
2. **Esperado**: multiplas mensagens sequenciais no Telegram, texto
   completo sem corte silencioso; os botoes aparecem apenas na ultima
   mensagem da sequencia e sao funcionais.

## Cenario 4 — Fallback para texto livre (Edge cases, FR-007)

1. Emita `MSQ_INPUT_REQUIRED:` sem bloco `OPTIONS:` (pergunta aberta), ou
   com mais de 8 opcoes, ou com um rotulo > 60 caracteres.
2. **Esperado**: notificacao chega no formato de texto livre existente
   (`Reply: input:<id> <text>`), sem botoes — nenhuma falha, nenhuma
   pergunta descartada.

## Cenario 5 — Toque tardio/invalido (Edge cases, FR-008)

1. Responda um pedido de input duas vezes: uma vez por texto livre
   (`input:<id> <texto>`), depois toque em um botao da mesma pergunta
   (ou vice-versa).
2. **Esperado**: a segunda resposta e ignorada (`stage_requests.response`
   permanece com o primeiro valor); o Telegram nao mostra erro visivel ao
   usuario (callback e respondido/fechado normalmente).

## Validacao por teste (baseline obrigatorio, sem precisar de Telegram real)

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

Suites focadas relevantes a esta feature (nomes existentes hoje —
confirmar apos Fase 2/tasks quais novos arquivos de teste foram criados):

```bash
rtk npx vitest run \
  tests/core/control.test.ts \
  tests/core/events-notifications.test.ts \
  tests/core/events-notifications-full.test.ts \
  tests/core/notify-telegram.test.ts \
  tests/core/notify-telegram-poller.test.ts \
  tests/db/repo.test.ts \
  tests/db/repo-extended.test.ts \
  tests/runner/execute.test.ts \
  tests/db/index-migrate.test.ts
```

Tratar como evidencia minima (ver `.claude/rules/harness.md`): novos casos
de teste passando para extracao de opcoes, montagem de `reply_markup`,
resolucao de callback por indice, e split de mensagem — mais o baseline
completo sem regressao (US2/SC-003).
