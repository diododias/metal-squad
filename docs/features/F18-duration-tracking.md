# F18 — Duration & Performance Tracking

**Epic**: [E04 — Observability](../epics/E04-observability.md)
**Prioridade**: Media
**Esforco**: Low

## Problema

Duracao eh calculada na TUI mas nao persiste de forma rica. Nao ha breakdown de tempo (quanto foi em processamento vs esperando gate vs retry).

## Solucao

### Timeline de eventos por run

Gravar eventos com timestamp no DB:

```sql
CREATE TABLE run_events (
  id INTEGER PRIMARY KEY,
  run_id INTEGER REFERENCES runs(id),
  event TEXT NOT NULL,         -- 'started', 'gate_wait', 'gate_resolved', 'retry', 'done', 'failed'
  metadata TEXT,               -- JSON com detalhes
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Metricas derivadas

- **Wall time**: started → ended
- **Agent time**: tempo em que o agente estava rodando
- **Wait time**: tempo esperando gates
- **Retry time**: tempo em retries

### Display

Na TUI detail view e no `msq stats`:
```
feat-01 — total 4m32s
  Agent: 3m10s (70%)
  Gate wait: 1m12s (27%)
  Retry: 10s (3%)
```

## Criterios de aceite

- [ ] Eventos de timeline gravados no DB
- [ ] Breakdown de tempo calculado e exibido
- [ ] Visivel no detail view da TUI e no CLI
