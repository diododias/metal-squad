# Contrato: Dispatch de notificacao Telegram para pergunta com botoes

Interface entre `src/core/events/notifications.ts` (consumidor do evento
`stage:request-created`) e a Telegram Bot API, via `TelegramChannel.send`
(`src/core/notify/telegram.ts`) e `TelegramPoller` (`src/core/notify/telegram-poller.ts`).
Este contrato so cobre `kind === 'input'`; `kind === 'approval'` permanece
inalterado (fora de escopo desta feature, coberto por regressao/US2).

## Envio (metal-squad -> Telegram)

Quando `stage:request-created` dispara com `kind: 'input'` e `options`
presente (array nao vazio, ja validado pelo parser — ver
`control-signal-format.md`):

- **Texto da mensagem**: mesmo formato ja usado hoje para `stage:input`
  (`metal-squad: <featureId> needs human input at stage <stage>` + linha
  em branco + `prompt`), SEM a linha `Reply: input:<id> <text>` (essa
  linha só faz sentido no fallback de texto livre; com botoes o rotulo
  de cada opcao ja e a instrucao).
- **`reply_markup.inline_keyboard`**: um botao por opcao, um por linha
  (`inline_keyboard: options.map((label, i) => [{ text: label,
  callback_data: 'input:' + requestId + ':' + i }])`).
- **Texto > 4096 caracteres**: `TelegramChannel.send` fatia o texto em
  multiplas chamadas `sendMessage` sequenciais; `reply_markup` (os
  botoes) e enviado apenas junto do ultimo fragmento.

Quando `options` esta ausente (fallback), o comportamento e
byte-a-byte identico ao existente hoje (mensagem de texto livre com a
linha `Reply: input:<id> <text>`, sem `reply_markup`).

## Resposta (Telegram -> metal-squad)

`TelegramPoller` reconhece dois formatos de `callback_query.data` /
`message.text` para pedidos de input:

| Formato | Origem | Comportamento |
|---|---|---|
| `input:<id> <texto qualquer>` | resposta manual por texto (existente, inalterado) | `resolveStageRequest(id, texto)` |
| `input:<id>:<indice>` | toque em botao (novo) | busca `options[indice]` via `getStageRequest(id)`; se `indice` valido, `resolveStageRequest(id, options[indice])`; se invalido (fora do range) ou pedido nao mais `pending`, nenhuma escrita — apenas `answerCallbackQuery` para fechar o spinner no cliente Telegram |

Em ambos os casos, se houver `callback_query.id` (resposta veio de botao),
`answerCallbackQuery` e chamado incondicionalmente ao final do
processamento — inclusive quando o toque foi tardio/invalido — para que o
Telegram nao mostre o botao "carregando" indefinidamente ao usuario.

## Efeito observavel (paridade com texto livre — FR-004, FR-009)

Ambos os caminhos da tabela acima terminam na mesma chamada
`resolveStageRequest(id, response)`. Isso garante, sem codigo adicional
no runner:

- o step em execucao (`waitForStageRequestResponse` em
  `src/core/runner/execute.ts`) recebe o mesmo `response: string` que
  receberia de uma resposta digitada;
- o evento `stage:request-resolved` (auditoria/observabilidade) e emitido
  da mesma forma, com o mesmo `response`, independente da origem.
