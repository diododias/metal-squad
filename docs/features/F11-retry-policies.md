# F11 — Retry Policies

**Epic**: [E03 — Orchestration v2](../epics/E03-orchestration-v2.md)
**Prioridade**: Alta
**Esforco**: Medium

## Problema

Hoje a politica eh stop-on-fail. Se um agente falha, tudo para. Nao ha retry automatico, o que eh problematico para falhas transientes (timeout, rate limit, erro de rede).

## Solucao

### Politicas configuraveis por feature

```yaml
features:
  - id: feat-01
    retry:
      maxAttempts: 3
      backoffMs: 5000
      onFail: continue  # continue | stop | gate
```

### Opcoes de `onFail`

- `stop` — para tudo (comportamento atual)
- `continue` — marca como failed, continua com proximas features
- `gate` — cria um gate para decisao humana antes de continuar

### Backoff

- Exponential backoff com jitter
- Configuravel por feature ou default global

### DB tracking

Nova tabela `retry_history`:
```sql
CREATE TABLE retry_history (
  id INTEGER PRIMARY KEY,
  run_id INTEGER REFERENCES runs(id),
  attempt INTEGER NOT NULL,
  error TEXT,
  retried_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Criterios de aceite

- [ ] Retry com maxAttempts e backoff configuravel
- [ ] Politica onFail: stop, continue, gate
- [ ] Historico de retries no DB
- [ ] Retry count visivel na TUI
