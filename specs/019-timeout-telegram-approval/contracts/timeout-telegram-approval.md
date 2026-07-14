# Contract — Timeout approval via Telegram

Contrato entre runner, event notifications, poller Telegram e repositório.

## Event `timeout:approval-created`

```ts
{
  requestId: number;
  occurrenceId: number;
  runId: number;
  pipelineId?: number;
  featureId: string;
  stage?: string;
  timeoutMs: number;
  runtimeMs: number;
  lastProgress?: string;
}
```

A mensagem sanitizada informa feature, estágio/run, limite/duração, motivo,
efeitos de Retry e Keep blocked. Os botões finais usam:

```text
timeout:<requestId> retry
timeout:<requestId> keep_blocked
```

Respostas textuais aceitam a mesma gramática, sem distinção de maiúsculas. Com
tópicos por feature, envio e callback exigem o chat e `message_thread_id` da
associação ativa; sem tópicos, segue o chat configurado existente.

## Event `timeout:approval-resolved`

```ts
{
  requestId: number;
  occurrenceId: number;
  runId: number;
  featureId: string;
  stage?: string;
  decision: 'retry' | 'keep_blocked';
  source: 'telegram';
}
```

Só é emitido quando o compare-and-set vence para uma request pendente. Callback
duplicado, tardio, cancelado, substituído ou de tópico errado não emite evento.

## Repository operations

- `createTimeoutOccurrence(...)` — registra de forma idempotente ocorrência e
  contexto.
- `createTimeoutApprovalRequest(...)` — cria no máximo uma request por ocorrência.
- `getTimeoutApprovalRequest(id)` — lê contexto e estado atual.
- `resolveTimeoutApproval(id, decision, context)` — valida contexto e resolve
  atomicamente; retorna se o callback venceu.
- `claimTimeoutRetry(id)` — reserva atomicamente o retry único.
- `attachTimeoutRetryRun(id, retryRunId)` — liga run e auditoria.
- `recordTimeoutNotificationDelivery(id, result)` — grava envio/erro sem mudar
  decisão.

## Typed adapter result

Timeout deve chegar como falha/controle estruturado com `timeoutMs`, `runtimeMs`
e progresso sanitizado. Falha genérica e abort manual não entram neste contrato.
