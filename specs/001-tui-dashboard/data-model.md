# Data Model: TUI Interativa — Painel de Runs, Tokens e Gates

## Existing Tables (unchanged schema)

### `repos`
| Column       | Type | Description                  |
|-------------|------|------------------------------|
| repo_id     | TEXT PK | Identificador do repositório |
| path        | TEXT | Caminho absoluto no filesystem |
| created_at  | TEXT | Timestamp ISO8601 |

### `runs`
| Column      | Type | Description |
|-------------|------|-------------|
| id          | INTEGER PK AUTOINCREMENT | |
| repo_id     | TEXT FK→repos | |
| feature_id  | TEXT | ID da feature no backlog.yaml |
| tool        | TEXT | `claude` \| `codex` \| `opencode` |
| status      | TEXT | `running` \| `done` \| `failed` \| **`blocked`** (novo valor) |
| started_at  | TEXT | Timestamp ISO8601 |
| ended_at    | TEXT \| NULL | NULL enquanto `running` |

> **Nota**: `blocked` é um novo valor permitido para `runs.status`. O SQLite não
> tem constraint de enum; o novo valor é reconhecido pelo TUI e pelo executor.

### `token_usage`
| Column   | Type | Description |
|----------|------|-------------|
| id       | INTEGER PK AUTOINCREMENT | |
| run_id   | INTEGER FK→runs | |
| input    | INTEGER | Tokens de entrada |
| output   | INTEGER | Tokens de saída |
| total    | INTEGER | input + output |

---

## New Table: `gates`

Registra decisões humanas sobre runs bloqueados. Append-only — nunca atualiza
registros anteriores, apenas insere novos.

```sql
CREATE TABLE IF NOT EXISTS gates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL REFERENCES runs(id),
  feature_id  TEXT NOT NULL,
  repo_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  decision    TEXT
);
```

| Column       | Type | Description |
|-------------|------|-------------|
| id          | INTEGER PK | |
| run_id      | INTEGER FK→runs | O run com status `blocked` que gerou este gate |
| feature_id  | TEXT | Cópia desnormalizada para queries rápidas sem join |
| repo_id     | TEXT | Cópia desnormalizada para queries rápidas sem join |
| created_at  | TEXT | Quando o gate foi aberto |
| resolved_at | TEXT \| NULL | NULL = gate aberto; timestamp = gate resolvido |
| decision    | TEXT \| NULL | `'approved'` \| `'skipped'` \| `'retried'` \| NULL (não resolvido) |

---

## State Transitions

### Run Status FSM

```
todo ──► running ──► done
                 ├──► failed
                 └──► blocked ──► (gate criado)
                                      │
                           TUI resolve gate:
                           approved/skipped/retried
```

### Gate Lifecycle

```
(run blocked) ──► gate criado (resolved_at = NULL)
                     │
          usuário age no TUI
                     │
             ├── approved → resolved_at = now, decision = 'approved'
             ├── skipped  → resolved_at = now, decision = 'skipped'
             └── retried  → resolved_at = now, decision = 'retried'
```

---

## TUI View: `RunSummary`

A view que o TUI consome (join de runs + token_usage + gates):

```typescript
interface RunSummary {
  runId:      number;
  repoId:     string;
  featureId:  string;
  tool:       'claude' | 'codex' | 'opencode';
  status:     'running' | 'done' | 'failed' | 'blocked';
  startedAt:  string;
  endedAt:    string | null;
  totalTokens: number | null;
  gateId:     number | null;     // null se não há gate aberto
  gateDecision: string | null;   // null se gate ainda não resolvido
}
```

Query:
```sql
SELECT
  r.id          AS runId,
  r.repo_id     AS repoId,
  r.feature_id  AS featureId,
  r.tool,
  r.status,
  r.started_at  AS startedAt,
  r.ended_at    AS endedAt,
  u.total       AS totalTokens,
  g.id          AS gateId,
  g.decision    AS gateDecision
FROM runs r
LEFT JOIN token_usage u ON u.run_id = r.id
LEFT JOIN gates g ON g.run_id = r.id AND g.resolved_at IS NULL
ORDER BY r.id DESC
LIMIT 50
```

---

## Validation Rules

- `runs.status` MUST be one of: `running`, `done`, `failed`, `blocked`
- `gates.decision` MUST be one of: `approved`, `skipped`, `retried`, or NULL
- A gate row MUST only be created when `runs.status = 'blocked'`
- `resolved_at` MUST be set atomically with `decision` — neither alone is valid
- A run MUST NOT have more than one open gate (resolved_at IS NULL)
