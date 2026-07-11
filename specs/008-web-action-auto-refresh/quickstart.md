# Quickstart Validation: Web Action State Auto Refresh

**Feature**: 008-web-action-auto-refresh  
**Date**: 2026-07-11

## Prerequisites

- Node.js >= 20.17.0
- Project dependencies installed (`npm install`)
- A writable runtime DB path
- A backlog/catalog state with at least one startable feature and one resumable or blocked run scenario

## Validation Scenarios

### Scenario 1: Start action removes stale TODO visibility

**Goal**: Confirm starting a feature from the web UI moves it out of pending/TODO automatically.

```bash
npm run build
node dist/index.js web
```

1. Open the web UI.
2. Identify a feature visible in the waiting/TODO area.
3. Trigger `start feature`.

**Expected**:
- No page reload is needed.
- The feature disappears from waiting/TODO once execution exists.
- A new execution representation appears in the appropriate run/execution surface.
- The same feature is not visible simultaneously as both waiting and executing.

---

### Scenario 2: Run control actions update detail and overview together

**Goal**: Confirm pause, resume, and abort refresh all shared views.

1. Open a running pipeline from the overview into run detail.
2. Trigger `pause`.
3. Observe the detail header, buttons, and overview state.
4. Trigger `resume`, then `abort`.

**Expected**:
- After each action result, the run status and available controls change automatically.
- The overview and detail screen converge on the same status.
- No stale action button remains enabled for a transition that no longer applies.

---

### Scenario 3: Blocker resolution refreshes all affected surfaces

**Goal**: Confirm gate and stage-request actions remove stale blocked state.

1. Open a blocked run that has either a gate or a pending stage request.
2. Resolve it with `approve`, `skip`, or `retry`.
3. If the same run is visible elsewhere in the session, observe both surfaces.

**Expected**:
- The blocker list updates automatically.
- The run's blocked status and follow-up controls refresh automatically.
- Other visible surfaces in the same session reflect the same new state without reload.

---

### Scenario 4: Sequential actions settle on the latest confirmed state

**Goal**: Confirm quick successive actions do not leave an older final state behind.

1. Use a resumable/blocked run.
2. Trigger two valid actions in quick succession, such as `resume` followed by another control or blocker resolution followed immediately by a follow-up action.

**Expected**:
- The final rendered state matches the latest confirmed backend state.
- The UI does not end with an older intermediate snapshot as the final view.

---

### Scenario 5: Failed action preserves reality

**Goal**: Confirm rejected or failed transitions do not leave the UI lying.

1. Trigger an action that is expected to fail or be denied in the current state.
2. Observe the resulting UI state.

**Expected**:
- A failure/notice signal is surfaced.
- The visible status remains aligned with the actual backend state.
- No surface falsely shows the requested transition as completed.

---

### Scenario 6: Automated regression coverage

**Goal**: Confirm the synchronization contract is protected by tests.

```bash
npm test -- tests/web/server.test.ts
npx vitest run tests/web/state.test.ts
```

**Expected**:
- Web server tests pass.
- Pending/TODO projection tests pass for newly-started and blocked runs.
- Coverage includes websocket refresh behavior for supported actions and stale-state prevention cases introduced by this feature.

## Recommended Automated Checks

| Check | Command | Pass Criteria |
|-------|---------|---------------|
| Build | `npm run build` | Exit 0 |
| Web server regression suite | `npm test -- tests/web/server.test.ts` | Exit 0 |
| Web state projection suite | `npx vitest run tests/web/state.test.ts` | Exit 0 |
| Full unit suite | `npm test` | Exit 0 if running full validation |

## Notes

- The key acceptance signal is synchronized UI state, not just successful DB mutation.
- Validation should include at least one flow initiated by a detached `startFeature` child process, because that is the main cross-process refresh case.
