# Quickstart: F08 Session and Run Navigation

## Prerequisites

- Node.js `>=20`
- Dependencies installed with `npm install`
- A writable DB path. For local validation in this repo, prefer:

```bash
MSQ_DB_PATH="$(pwd)/tests/fixtures/session-navigation.db"
```

- A fixture or real DB containing:
  - at least two registered repos with run history
  - at least one feature with two or more historical runs
  - at least one run with partial or in-progress metadata

## Build

```bash
npm run build
```

## Automated Validation

Run the focused suites that cover the new navigation read models and TUI state:

```bash
npm run test -- tests/db/repo-navigation.test.ts tests/ui/navigation.test.ts tests/ui/app.test.ts
```

Expected outcome:

- Repo, feature, and run-history queries return correctly scoped rows
- Back-navigation preserves prior selection state
- Compare mode accepts exactly two runs from the same feature and rejects invalid pairs
- Active filters and search state remain visible and clear correctly

## Manual Validation

Launch the TUI against the prepared history DB:

```bash
MSQ_DB_PATH="$(pwd)/tests/fixtures/session-navigation.db" npm run dev -- ui
```

### Scenario 1: Drill Down and Return

1. Start on `Overview`.
2. Select a repo and press `enter`.
3. Select a feature and press `enter`.
4. Select a run and press `enter`.
5. Press `esc` repeatedly to move back to `Feature`, `Repo`, and `Overview`.

Expected outcome:

- Each level opens without leaving the TUI.
- Each `esc` returns to the prior level and restores the previous selection.

### Scenario 2: Filter and Search

1. In `Repo` or `Feature`, press `f` and enable one or more statuses.
2. Press `t` and narrow to a tool used in the current scope.
3. Press `/` and search by feature id or title.
4. Clear the filters and query without leaving the current level.

Expected outcome:

- Only matching rows remain visible.
- The active status/tool/query state remains visible.
- A zero-match result renders an explanatory empty state.

### Scenario 3: Compare Runs

1. Open a feature with at least two runs.
2. Use `space` to select two runs.
3. Press `c`.
4. Return with `esc`.

Expected outcome:

- The compare view highlights differences in result, duration, and token usage.
- Returning from compare restores the feature-history selection.

### Scenario 4: Reject Invalid Compare

1. Try to compare with fewer than two runs selected.
2. Try to compare a run selection that crosses feature boundaries by changing
   context before opening compare.

Expected outcome:

- The UI blocks the action and explains why the comparison is invalid.
