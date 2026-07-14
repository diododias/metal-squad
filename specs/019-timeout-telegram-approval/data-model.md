# Data Model — F55

O modelo reutiliza `runs`, `pipelines`, `run_events`, `run_output` e
`feature_topic_associations` como contexto. As novas tabelas entram na migração
SQLite em `src/db/index.ts` e nas operações de `src/db/repo.ts`.

## TimeoutOccurrence

Tabela `timeout_occurrences`:

- `id` — chave primária inteira.
- `run_id` — FK obrigatória para `runs`, única; uma ocorrência por execução.
- `pipeline_id` — FK opcional para `pipelines`.
- `feature_id` — identificador obrigatório.
- `stage` — estágio opcional; em fluxo não staged, a unidade é a feature.
- `timeout_ms` — limite positivo configurado.
- `runtime_ms` — duração observada não negativa.
- `last_progress` — progresso sanitizado e truncado.
- `status` — `pending`, `resolved`, `cancelled` ou `superseded`.
- `created_at`, `resolved_at` — timestamps.

Criação é idempotente e não ocorre se o run já terminou `done` ou possui timeout
registrado.

## TimeoutApprovalRequest

Tabela `timeout_approval_requests`:

- `id` — chave primária e identificador usado nos callbacks.
- `timeout_occurrence_id` — FK obrigatória, única.
- `pipeline_id`, `run_id`, `feature_id`, `stage` — contexto imutável para
  validação de callback e diagnóstico.
- `status` — `pending`, `approved`, `blocked`, `cancelled` ou `superseded`.
- `decision` — `retry` ou `keep_blocked`.
- `decision_source` — `telegram`, `system` ou `resume`.
- `notification_status` — `pending`, `sent` ou `failed`.
- `notification_attempts`, `last_notification_error`, `notified_at` — auditoria
  da entrega.
- `retry_run_id` — FK opcional, única quando preenchida.
- `created_at`, `resolved_at` — timestamps.

Resolução altera somente `status = 'pending'` e contexto correspondente.
`claimTimeoutRetry` altera somente request aprovada sem `retry_run_id`, fazendo
callbacks duplicados serem no-ops.

## RecoveryDecision

Tabela `recovery_decisions`:

- `id` — chave primária.
- `timeout_occurrence_id`, `approval_request_id` — FKs obrigatórias.
- `decision` — `retry` ou `keep_blocked`.
- `source` — `telegram` ou fonte de recuperação persistida.
- `retry_run_id` — preenchido quando uma nova execução for criada.
- `reason`, `created_at` — auditoria e timestamp.

Uma decisão efetiva por request mantém vinculados timeout, resposta e retry.

## State transitions

```text
running run
    │ timeout detectado
    ▼
blocked run + paused/blocked pipeline + pending request
    ├── Retry ────────> approved ──claim──> um novo run no mesmo estágio
    ├── Keep blocked ─> blocked request, pipeline permanece bloqueado
    ├── sem resposta ─> pending request, nenhum retry
    └── inválido/tarde > nenhuma alteração de estado
```

Falha de envio muda apenas a auditoria de entrega para `failed`; não aprova nem
recupera o timeout.
