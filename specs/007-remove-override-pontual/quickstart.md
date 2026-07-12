# Quickstart Validation: Remove OVERRIDE PONTUAL

**Feature**: 007-remove-override-pontual  
**Date**: 2026-07-11

## Prerequisites

- Node.js >= 20.17.0
- Project dependencies installed (`npm install`)
- A working `backlog.yaml` with at least one feature declared

## Validation Scenarios

### Scenario 1: CLI flags removidas

**Goal**: Confirm `msq run --help` no longer lists override flags.

```bash
npm run build
node dist/index.js run --help
```

**Expected**: Output does NOT contain `--tool`, `--model`, or `--effort` options. Only standard options (`--feature`, `--concurrency`, `--auto-advance-stages`) are listed.

---

### Scenario 2: Web UI sem OverrideSection

**Goal**: Confirm the feature preview screen has no override section.

```bash
npm run dev
# Open browser to http://localhost:<port>
# Navigate to a feature's detail/preview screen
```

**Expected**:
- No section titled "Override pontual" is visible
- No fields labeled "tool/model/effort" in an override context
- The "Feature Config" tab shows only the `FeatureConfigForm` with "save config" button
- Footer text does not mention "overrides"

---

### Scenario 3: Save Config persists correctly

**Goal**: Confirm editing and saving feature parameters works end-to-end.

1. Open feature detail in web UI
2. Change `tool` from current value to a different tool
3. Change `effort` from current value
4. Click "save config"
5. Reload the page
6. Open the same feature detail

**Expected**: The changed values (`tool`, `effort`) are persisted and displayed correctly after reload.

---

### Scenario 4: Start feature uses persisted config

**Goal**: Confirm starting a feature uses DB-persisted configuration.

1. Set a feature's `tool` to `opencode` via "save config"
2. Click "start feature"
3. Observe the run output

**Expected**: The feature runs with `opencode` (the persisted value), not any other tool.

---

### Scenario 5: Typecheck, lint, tests pass

**Goal**: Confirm no broken references after removal.

```bash
npm run typecheck
npm run lint
npm test
```

**Expected**: All three commands complete without errors.

---

### Scenario 6: Zero override references in source

**Goal**: Confirm SC-001 — no override pontual references remain.

```bash
grep -ri "override pontual\|OVERRIDE PONTUAL" src/ tests/
grep -ri "one-off.*override\|override.*one-off" src/
```

**Expected**: Zero matches in source code. Documentation files (F37 feature brief, historical specs) may still reference it for context.

---

## Automated Checks

| Check | Command | Pass Criteria |
|-------|---------|---------------|
| Typecheck | `npm run typecheck` | Exit 0 |
| Lint | `npm run lint` | Exit 0 |
| Unit tests | `npm test` | All pass |
| Build | `npm run build` | Exit 0 |
| CLI help | `node dist/index.js run --help` | No `--tool`/`--model`/`--effort` |
