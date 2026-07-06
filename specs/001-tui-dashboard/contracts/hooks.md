# Contracts: TUI Hooks & DB Interface

## Hook Contracts

### `useRuns(intervalMs?: number): RunSummary[]`

Polling hook. Reads `RunSummary` rows from DB every `intervalMs` milliseconds.
Returns an empty array until the first read completes.

```typescript
// src/ui/hooks/useRuns.ts
export function useRuns(intervalMs?: number): RunSummary[]
```

| Parameter  | Type   | Default | Description |
|-----------|--------|---------|-------------|
| intervalMs | number | 2000    | Polling interval in ms |

| Return     | Type          | Description |
|-----------|---------------|-------------|
| (value)   | RunSummary[]  | Most recent 50 runs, ordered by id DESC |

**Contract**: Never throws; returns `[]` on DB error.
**Contract**: Cleans up its interval on unmount (effect cleanup).

---

### `useGates(): { gates: GateRow[], resolve: ResolveGateFn }`

Polls open gates and exposes a resolve action.

```typescript
// src/ui/hooks/useGates.ts
export interface GateRow {
  id: number;
  runId: number;
  featureId: string;
  repoId: string;
  createdAt: string;
}

export type GateDecision = 'approved' | 'skipped' | 'retried';
export type ResolveGateFn = (gateId: number, decision: GateDecision) => void;

export function useGates(intervalMs?: number): {
  gates: GateRow[];
  resolve: ResolveGateFn;
}
```

**Contract**: `resolve` is synchronous (SQLite write) and triggers an immediate
re-poll so the UI updates within the same render cycle.
**Contract**: `resolve` is idempotent — calling it on an already-resolved gate is a no-op.

---

### `useTerminalWidth(): number`

Returns `process.stdout.columns`, defaulting to 80 if unavailable.

```typescript
// src/ui/hooks/useTerminalWidth.ts
export function useTerminalWidth(): number
```

**Contract**: Updates on `SIGWINCH` (terminal resize) by listening to stdout's
`resize` event and setting state.

---

## DB Query Contracts

### `listRunsForTui(limit: number): RunSummary[]`

```typescript
// src/db/repo.ts (addition)
export interface RunSummary {
  runId: number;
  repoId: string;
  featureId: string;
  tool: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  totalTokens: number | null;
  gateId: number | null;
  gateDecision: string | null;
}

export function listRunsForTui(limit?: number): RunSummary[]
```

Executes the join query defined in `data-model.md`. Returns rows ordered by
`runs.id DESC`. Default limit: 50.

---

### `openGates(): GateRow[]`

```typescript
export function openGates(): GateRow[]
```

Returns all gates where `resolved_at IS NULL`, ordered by `created_at ASC`.

---

### `resolveGate(id: number, decision: GateDecision): void`

```typescript
export function resolveGate(id: number, decision: GateDecision): void
```

Updates `resolved_at = datetime('now')` and `decision` for the gate with the given id.
**Contract**: No-op if gate is already resolved (does not throw).

---

### `createGate(runId: number, featureId: string, repoId: string): number`

```typescript
export function createGate(runId: number, featureId: string, repoId: string): number
```

Inserts a new open gate record. Returns the new gate `id`.
Called by `execute.ts` when a feature run ends with `blocked` status.

---

## Keyboard Interface Contract

The TUI MUST respond to the following keystrokes while the app is focused:

| Key     | Context          | Action |
|---------|-----------------|--------|
| `q`     | Any             | Exit TUI (calls `process.exit(0)`) |
| `↑`     | Gate panel visible | Move selection up in gate list |
| `↓`     | Gate panel visible | Move selection down in gate list |
| `a`     | Gate selected   | Resolve selected gate as `'approved'` |
| `s`     | Gate selected   | Resolve selected gate as `'skipped'` |
| `r`     | Gate selected   | Resolve selected gate as `'retried'` |
| `Ctrl+C` | Any            | Exit TUI (default ink behavior) |

**Contract**: If no gates are visible, `↑`, `↓`, `a`, `s`, `r` are no-ops.
**Contract**: Key handling MUST NOT block the polling interval.
