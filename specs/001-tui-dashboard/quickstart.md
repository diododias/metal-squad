# Quickstart Validation: TUI Interativa

## Prerequisites

```bash
npm install       # install dependencies
npm run build     # compile TypeScript → dist/
npm link          # or: node dist/index.js
msq init          # initialize DB and register current repo
```

## Scenario 1: Empty State (P1 smoke test)

**Purpose**: Verify the TUI opens and shows a helpful message when no runs exist.

```bash
# Clear any existing runs (or use a fresh DB)
rm -f ~/.local/share/metal-squad/app.db

msq ui
```

**Expected**: TUI opens and displays an empty-state message instructing the user
to run `msq run` first. No error, no crash.

**Exit**: Press `q`.

---

## Scenario 2: Live Pipeline Monitor (P1 full test)

**Purpose**: Verify real-time polling of an active pipeline.

```bash
# Terminal 1 — start TUI
msq ui

# Terminal 2 — start a pipeline
cp backlog.example.yaml backlog.yaml
msq run
```

**Expected**:
1. Within 3 seconds of `msq run` starting, Terminal 1 shows the first feature
   with status `running` and an elapsed-time counter.
2. When a feature completes, status changes to `done` within 3 seconds.
3. Failed features appear highlighted differently from successful ones.

---

## Scenario 3: Token Usage Display (P2 full test)

**Purpose**: Verify token usage is displayed after a completed run.

```bash
# After running Scenario 2 (or with existing completed runs):
msq ui
```

**Expected**: Each completed feature shows a token count (e.g., `1.2k` or `1234`).
Features still `running` show `—` in the tokens column.

Verify against DB:
```bash
# In a separate terminal — confirm tokens were recorded
sqlite3 ~/.local/share/metal-squad/app.db \
  "SELECT r.feature_id, u.total FROM runs r LEFT JOIN token_usage u ON u.run_id = r.id ORDER BY r.id DESC LIMIT 5;"
```

---

## Scenario 4: Gate Actions (P3 full test)

**Purpose**: Verify a blocked gate can be resolved from the TUI.

```bash
# Insert a test gate directly into the DB
sqlite3 ~/.local/share/metal-squad/app.db << 'SQL'
INSERT INTO runs (repo_id, feature_id, tool, status, ended_at)
VALUES ('test-repo', 'feat-test-gate', 'claude', 'blocked', datetime('now'));

INSERT INTO gates (run_id, feature_id, repo_id)
VALUES (last_insert_rowid(), 'feat-test-gate', 'test-repo');
SQL

msq ui
```

**Expected**:
1. TUI shows `feat-test-gate` highlighted as blocked with a visual indicator.
2. A gate action hint (e.g., `[a]pprove [s]kip [r]etry`) is visible.
3. Pressing `a` resolves the gate; the feature is no longer shown as blocked.

Verify:
```bash
sqlite3 ~/.local/share/metal-squad/app.db \
  "SELECT decision, resolved_at FROM gates ORDER BY id DESC LIMIT 1;"
# Expected: approved | <timestamp>
```

---

## Scenario 5: Narrow Terminal (layout resilience)

**Purpose**: Verify the TUI degrades gracefully at small terminal widths.

```bash
# Resize terminal to ~45 columns, then:
msq ui
```

**Expected**: TUI renders without wrapping artifacts or layout breaks. Feature IDs
and statuses remain visible; secondary columns (tool, tokens) may be hidden.

---

## Scenario 6: Exit Without Interrupting a Run

**Purpose**: Verify quitting TUI does not kill an active `msq run`.

```bash
# Terminal 1: start a run
msq run &

# Terminal 2: open and close TUI
msq ui
# Press q immediately

# Back to Terminal 1 — run should continue
wait; echo "run completed: $?"
```

**Expected**: `msq run` completes normally after `msq ui` exits.
