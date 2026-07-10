# F33 — Production Hardening

**Epic**: [E03 — Orchestration v2](../epics/E03-orchestration-v2.md)
**Prioridade**: Alta
**Esforço**: Low (~2h30)
**Depende de**: F14, F32

## Problema

Análise arquitetural v3 identificou 4 gaps reais de produção:

1. **Budget não persiste entre restarts** — `BudgetTracker` é estado em memória (`let tokens = 0`). Ao reiniciar `msq run`, zera tudo.
2. **Sem reset diário automático** — Não há lógica de "se mudou o dia, zere contadores". Budget só reseta no restart.
3. **WebSocket sem heartbeat** — Conexões mortas não detectadas → ghost clients acumulam no `wss.clients`.
4. **Telegram: alerta de budget sem ação** — `budget:alert` chega no Telegram mas sem botão inline para retomar pipeline pausado.

## Solução

### 1. Lazy Daily Budget Reset

**Onde**: `src/core/budget/tracker.ts` + `src/config/index.ts`

**Config** (`config/index.ts`):
```typescript
const BudgetConfig = z.object({
  alertAtPercent: z.number().int().min(1).max(100).default(80),
  lastResetDate: z.string().optional(), // YYYY-MM-DD
});
```

**Tracker** (`tracker.ts`):
- No `createBudgetTracker()`: checar se `config.budget.lastResetDate !== today`
- Se diferente: zerar `tokens`, `perFeatureTokens`, `alerted`, `featureViolationsReported`
- Atualizar `config.budget.lastResetDate = today` via `saveConfig()`

**Fluxo**:
```
msq run → createBudgetTracker()
  → if (config.budget.lastResetDate !== today) {
      tokens = 0;
      perFeatureTokens.clear();
      alerted.clear();
      featureViolationsReported.clear();
      config.budget.lastResetDate = today;
      saveConfig(config);
    }
```

### 2. Persistir BudgetTracker no SQLite

**Nova tabela** (`src/db/index.ts`):
```sql
CREATE TABLE IF NOT EXISTS budget_state (
  key TEXT PRIMARY KEY,           -- 'global' | 'feature:{featureId}'
  tokens INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Tracker** (`tracker.ts`):
- **Init**: carregar de `budget_state` (se `lastResetDate == today`)
- **Record**: após atualizar memória, upsert em `budget_state`

**Queries** (`src/db/repo.ts`):
```typescript
export function loadBudgetState(key: string): number | null {
  const row = db.prepare(`SELECT tokens FROM budget_state WHERE key = ?`).get(key) as { tokens: number } | undefined;
  return row?.tokens ?? null;
}

export function saveBudgetState(key: string, tokens: number): void {
  db.prepare(`
    INSERT INTO budget_state (key, tokens) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET tokens = excluded.tokens, updated_at = datetime('now')
  `).run(key, tokens);
}
```

**Fluxo**:
```
createBudgetTracker()
  → if (lastResetDate == today) {
      tokens = loadBudgetState('global') ?? 0;
      // carregar per-feature também
    }

record(featureId, usage)
  → tokens += usage.total;
  → saveBudgetState('global', tokens);
  → saveBudgetState(`feature:${featureId}`, featureTotal);
```

### 3. WebSocket Heartbeat (ping/pong)

**Onde**: `src/web/server.ts` (`wss.on('connection', ...)`)

**Implementação**:
```typescript
wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });

  const heartbeat = setInterval(() => {
    if (!socket.isAlive) {
      socket.terminate();
      return clearInterval(heartbeat);
    }
    socket.isAlive = false;
    socket.ping();
  }, 30_000);

  socket.on('close', () => clearInterval(heartbeat));
  // ... resto do handler
});
```

**Resultado**: Conexões mortas detectadas e removidas em ≤60s (2 ciclos de 30s).

### 4. Telegram: Botão Resume no Budget Alert

**Onde**: `src/core/events/notifications.ts` (handler de `budget:alert`) + `src/core/notify/telegram-poller.ts`

**Notification handler** (`notifications.ts`):
```typescript
eventBus.subscribe('budget:alert', ({ percent, spent, limit }) => {
  const pipelineId = getPausedPipelineIdForBudget(); // buscar pipeline pausado por budget
  const reply_markup = pipelineId
    ? {
        inline_keyboard: [[
          { text: '▶️ Resume Pipeline', callback_data: `resume_pipeline:${String(pipelineId)}` },
        ]],
      }
    : undefined;

  void dispatch('budget:alert', `metal-squad: budget ${String(percent)}% reached (${String(spent)}/${String(limit)})`, {
    percent,
    spent,
    limit,
    reply_markup,
  }).catch(() => { /* ignore dispatch errors */ });
});
```

**Poller handler** (`telegram-poller.ts`):
```typescript
// No loop de callback queries:
if (text.startsWith('resume_pipeline:')) {
  const pipelineId = Number(text.split(':')[1]);
  if (pipelineId) {
    try {
      resumePipeline(pipelineId);
      if (callbackId) void this.answerCallback(token, callbackId);
    } catch { /* DB may be unavailable */ }
  }
  continue;
}
```

**Query auxiliar** (`src/db/repo.ts`):
```typescript
export function getPausedPipelineIdForBudget(): number | null {
  const row = db.prepare(`
    SELECT id FROM pipelines
    WHERE status = 'paused'
    ORDER BY updated_at DESC
    LIMIT 1
  `).get() as { id: number } | undefined;
  return row?.id ?? null;
}
```

## Áreas técnicas afetadas

- `src/config/index.ts` — adicionar `lastResetDate` ao `BudgetConfig`
- `src/core/budget/tracker.ts` — persistência + lazy reset
- `src/db/index.ts` — nova tabela `budget_state`
- `src/db/repo.ts` — queries `loadBudgetState`, `saveBudgetState`, `getPausedPipelineIdForBudget`
- `src/web/server.ts` — heartbeat ping/pong (30s)
- `src/core/events/notifications.ts` — adicionar `reply_markup` ao `budget:alert`
- `src/core/notify/telegram-poller.ts` — handler `resume_pipeline:{id}`

## Critérios de aceite

- [ ] Budget sobrevive restart do processo (contadores carregados do SQLite)
- [ ] Contadores resetam automaticamente ao mudar o dia (lazy reset)
- [ ] Conexões WebSocket mortas são detectadas e removidas em ≤60s
- [ ] Alerta de budget no Telegram inclui botão inline "Resume Pipeline" quando há pipeline pausado
- [ ] Botão "Resume Pipeline" retoma o pipeline corretamente

## Não fazer

- **Cron job meia-noite UTC** — lazy reset no próximo comando é mais simples, sem timezone/DST/processo externo
- **Tabela `daily_usage` dedicada** — `SELECT SUM(total_tokens) FROM runs WHERE date(started_at) = date('now')` resolve; sem tabela extra
- **Redis/PubSub para multi-instância** — YAGNI, single process hoje
