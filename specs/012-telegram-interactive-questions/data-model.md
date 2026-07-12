# Data Model: Perguntas Interativas via Telegram (Botoes)

Nenhuma entidade nova de dominio; esta feature estende entidades ja
persistidas em SQLite (`src/db/index.ts`, `src/db/repo.ts`). Nao ha
migracao destrutiva — apenas uma coluna nova, nullable, seguindo o padrao
`ensureXColumn` ja usado no arquivo.

## `stage_requests` (tabela existente — 1 coluna nova)

| Coluna        | Tipo             | Novo? | Descricao |
|---------------|------------------|-------|-----------|
| `id`          | INTEGER PK       | nao   | id do pedido |
| `pipeline_id` | INTEGER FK       | nao   | pipeline de origem |
| `run_id`      | INTEGER FK       | nao   | run que gerou o pedido |
| `feature_id`  | TEXT             | nao   | feature de origem |
| `stage`       | TEXT             | nao   | stage do workflow (`specify`, `plan`, ...) |
| `kind`        | TEXT             | nao   | `'approval' \| 'input'` — ja distingue pergunta de aprovacao (H19) |
| `prompt`      | TEXT             | nao   | texto da pergunta/pedido (sem o bloco `OPTIONS:` quando opcoes foram extraidas com sucesso) |
| `options`     | TEXT (JSON, null)| **sim** | array JSON de rotulos de opcao extraidos do output da IA (`["Opcao A", "Opcao B"]`), `NULL` quando nao ha opcoes discretas parseaveis/validas |
| `status`      | TEXT             | nao   | `'pending' \| 'resolved'` |
| `response`    | TEXT             | nao   | resposta final (rotulo da opcao escolhida por botao, ou texto livre digitado) — mesma coluna para os dois canais de resposta |
| `source`      | TEXT             | nao   | `'manual' \| 'auto'` |
| `created_at`  | TEXT             | nao   | timestamp |
| `resolved_at` | TEXT             | nao   | timestamp de resolucao |

### Regras de validacao (aplicadas antes de persistir `options`)

- `options` so e definido quando `kind === 'input'` (nunca para `kind ===
  'approval'`, que continua usando o par aprovar/rejeitar/segurar fixo ja
  existente).
- Extraido no adapter (`parseControlSignal`), nao no ponto de persistencia:
  se a extracao falhar as validacoes abaixo, `options` chega como
  `undefined`/`null` ao `createStageRequest` e a coluna fica `NULL`
  (fallback texto livre, sem alterar o `prompt` original).
- Contagem: `1 <= options.length <= 8`.
- Tamanho por rotulo: `1 <= label.length <= 60` caracteres.
- Sem duplicatas exatas de rotulo dentro do mesmo pedido (evita dois
  botoes indistinguiveis).

### Transicoes de estado (inalteradas por esta feature)

`pending -> resolved` e a unica transicao (`resolveStageRequest`), unica
independentemente da resposta ter vindo de um toque em botao ou de texto
livre — nenhuma transicao nova introduzida. Um toque em botao associado a
um pedido ja `resolved` (ou a um `optionIndex` fora do range de
`options`) e tratado como no-op no poller: nao ha update de linha (a
clausula `WHERE ... AND status = 'pending'` em `resolveStageRequest` ja
garante idempotencia), apenas a resposta ao callback do Telegram (remover
o spinner) e enviada.

## `RunControl` (tipo em memoria, `src/core/adapters/types.ts`)

```ts
interface RunControl {
  type: 'needs_input';
  prompt: string;           // existente — texto da pergunta (sem bloco OPTIONS: quando extraido)
  options?: string[];       // novo — rotulos de opcao, na ordem apresentada pela IA
}
```

Nao persistido diretamente; e a estrutura intermediaria que o adapter
retorna em `RunResult.control` e que `executeStagedFeature` traduz para
`createStageRequest(..., { options })`.

## `StageRequestCreatedEvent` (evento em memoria, `src/core/events/types.ts`)

```ts
interface StageRequestCreatedEvent {
  requestId: number;
  pipelineId: number;
  featureId: string;
  stage: string;
  kind: StageRequestKind;
  prompt: string;
  source?: 'manual' | 'auto';
  options?: string[];       // novo — espelha stage_requests.options
}
```

Consumido exclusivamente por `attachEventNotifications`
(`src/core/events/notifications.ts`) para decidir se monta `reply_markup`
com botoes de opcao.

## Callback de botao (nao persistido — protocolo Telegram)

`callback_data` (string, max 64 bytes pela Telegram Bot API):

```
input:<requestId>:<optionIndex>
```

- `requestId`: inteiro, mesmo id de `stage_requests.id`.
- `optionIndex`: inteiro 0-based, indice dentro do array `options`
  persistido para aquele `requestId`.

Resolvido pelo poller (`src/core/notify/telegram-poller.ts`) buscando
`getStageRequest(requestId).options[optionIndex]` e chamando
`resolveStageRequest(requestId, label)` — a mesma funcao usada pela via de
texto livre, garantindo paridade de efeito observavel (FR-004) e de
auditoria (FR-009).
