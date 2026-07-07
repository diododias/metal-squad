# Quickstart: Command Palette & Keyboard Shortcuts

**Feature**: 003-command-palette  
**Date**: 2026-07-07

## Overview

This guide provides end-to-end validation scenarios to verify the command palette and keyboard shortcuts feature works as expected. These scenarios correspond to the acceptance criteria in `spec.md`.

---

## Prerequisites

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Set up local database** (to avoid permission issues):
   ```bash
   export MSQ_DB_PATH="$(pwd)/.metal-squad/app.db"
   ```

3. **Ensure backlog has at least one feature defined** in `backlog.yaml`

4. **Terminal requirements**: 
   - Minimum width: 80 columns (for proper UI rendering)
   - Terminal must support Ctrl key combinations

---

## Validation Scenario 1: Command Palette Opening & Fuzzy Search

**Goal**: Verify command palette opens and filters commands via fuzzy search.

### Steps

1. Start the TUI:
   ```bash
   node dist/index.js ui
   ```

2. **Open command palette with `Ctrl+P`**:
   - Press `Ctrl+P`
   - **Expected**: Command palette modal appears with search input focused

3. **Open command palette with `:`**:
   - Press `Esc` to close palette (if open)
   - Press `:`
   - **Expected**: Command palette modal appears again

4. **Fuzzy search for "run"**:
   - Type `run` into the palette
   - **Expected**: All run-related commands appear (e.g., "Pause run", "Resume run", "Abort run")

5. **Fuzzy search with partial match**:
   - Clear query and type `pau`
   - **Expected**: "Pause run" command appears (fuzzy match on "pause")

6. **Close palette with Escape**:
   - Press `Esc`
   - **Expected**: Palette closes, main UI returns

### Success Criteria

- ✅ Palette opens with both `Ctrl+P` and `:`
- ✅ Fuzzy search filters commands in real-time
- ✅ Partial/fuzzy matches work (e.g., "pau" matches "pause")
- ✅ Palette closes with `Esc`

---

## Validation Scenario 2: Command Execution from Palette

**Goal**: Verify commands can be selected and executed from the palette.

### Steps

1. **Ensure at least one run exists**:
   - If no runs exist, start one: `node dist/index.js run --feature <feature-id>`
   - Return to TUI: `node dist/index.js ui`

2. **Open command palette**:
   - Press `Ctrl+P`

3. **Navigate to "Pause run" command**:
   - Type `pause` (or use arrow keys to navigate)
   - **Expected**: "Pause run" command is highlighted

4. **Execute command with Enter**:
   - Press `Enter`
   - **Expected**: 
     - Palette closes
     - Run is paused (verify in UI status)

5. **Resume run via palette**:
   - Press `Ctrl+P` again
   - Type `resume`
   - Press `Enter`
   - **Expected**: Run resumes

### Success Criteria

- ✅ Commands execute when selected with `Enter`
- ✅ Palette closes after execution
- ✅ Command effects are visible in the UI (e.g., run paused/resumed)

---

## Validation Scenario 3: Context-Aware Keyboard Shortcuts

**Goal**: Verify context-specific shortcuts work only in their designated panels.

### Prerequisites

- At least one run with a pending gate (to test gate shortcuts)

### Steps

1. **Navigate to gates panel**:
   - Start TUI: `node dist/index.js ui`
   - Press `Tab` until "Gates" panel is focused (highlighted)

2. **Test gate approval shortcut**:
   - With a pending gate selected, press `a`
   - **Expected**: Gate is approved immediately

3. **Test gate skip shortcut**:
   - With another pending gate selected, press `s`
   - **Expected**: Gate is skipped

4. **Test gate retry shortcut**:
   - With a failed gate, press `r`
   - **Expected**: Gate retry is triggered

5. **Switch to runs panel**:
   - Press `Tab` to focus "Runs" panel

6. **Verify gate shortcuts are inactive**:
   - Press `a`, `s`, or `r`
   - **Expected**: Nothing happens (shortcuts are context-specific to gates panel)

7. **Test run control shortcuts**:
   - Select a running run and press `Enter` to open run detail
   - Press `p` (pause)
   - **Expected**: Run pauses
   - Press `x` (abort)
   - **Expected**: Abort confirmation appears (or run aborts)

### Success Criteria

- ✅ Gate shortcuts (`a`, `s`, `r`) work only in gates panel
- ✅ Run detail shortcuts (`p`, `x`) work in run detail view
- ✅ Shortcuts do nothing when in wrong context

---

## Validation Scenario 4: Global Navigation Shortcuts

**Goal**: Verify global shortcuts work from any screen.

### Steps

1. **Test quit shortcut**:
   - Start TUI: `node dist/index.js ui`
   - Press `q`
   - **Expected**: TUI exits cleanly

2. **Test tab cycling**:
   - Restart TUI
   - Press `Tab` multiple times
   - **Expected**: Focus cycles through panels (Runs → Gates → Main → Runs)

3. **Test j/k navigation**:
   - Focus on runs panel
   - Press `j` (down) and `k` (up) several times
   - **Expected**: Selection moves through list items

4. **Test Enter to drill down**:
   - Select a run and press `Enter`
   - **Expected**: Run detail view opens

5. **Test Escape to go back**:
   - From run detail, press `Esc`
   - **Expected**: Returns to overview

6. **Test log toggle**:
   - Press `Ctrl+L`
   - **Expected**: Log view toggles visibility

7. **Test tab switching**:
   - Press `1`, `2`, `3`, `4`, `5` (if tabs exist)
   - **Expected**: Corresponding tab becomes active

### Success Criteria

- ✅ `q` quits from anywhere
- ✅ `Tab` cycles focus
- ✅ `j/k` navigate lists
- ✅ `Enter` drills down, `Esc` goes back
- ✅ `Ctrl+L` toggles logs
- ✅ Number keys switch tabs

---

## Validation Scenario 5: Help Overlay

**Goal**: Verify help overlay displays all shortcuts correctly.

### Steps

1. **Open help overlay**:
   - Start TUI: `node dist/index.js ui`
   - Press `?`
   - **Expected**: Help overlay modal appears with shortcuts listed

2. **Verify global shortcuts shown**:
   - **Expected**: Help lists shortcuts like `q` (quit), `Tab` (cycle focus), etc.

3. **Verify context-specific shortcuts highlighted**:
   - Navigate to gates panel (press `Tab`)
   - Press `?` again
   - **Expected**: Help overlay highlights/marks gate-specific shortcuts (`a`, `s`, `r`)

4. **Close help overlay**:
   - Press `?` or `Esc`
   - **Expected**: Help overlay closes

### Success Criteria

- ✅ Help overlay opens with `?`
- ✅ All global shortcuts are listed
- ✅ Context-specific shortcuts are highlighted when relevant
- ✅ Overlay closes with `?` or `Esc`

---

## Validation Scenario 6: Status Bar Hints

**Goal**: Verify status bar updates with context-relevant shortcut hints.

### Steps

1. **View status bar in runs panel**:
   - Start TUI: `node dist/index.js ui`
   - Focus on runs panel (default focus)
   - **Expected**: Status bar shows hints like `j/k:navigate`, `enter:select`, `tab:focus`, `?:help`

2. **View status bar in gates panel**:
   - Press `Tab` to focus gates panel
   - **Expected**: Status bar updates to show `a:approve`, `s:skip`, `r:retry`, `?:help`

3. **View status bar in run detail**:
   - Select a run and press `Enter` to open detail view
   - **Expected**: Status bar shows `p:pause`, `x:abort`, `esc:back`, `?:help`

### Success Criteria

- ✅ Status bar updates dynamically based on focus
- ✅ Hints match actually available shortcuts in current context
- ✅ Hints are readable and concise

---

## Edge Case Testing

### Test 1: Invalid Command in Palette

1. Open command palette (`Ctrl+P`)
2. Type nonsense query: `xyzabc123`
3. **Expected**: No matches shown, or "No commands found" message

### Test 2: Command Palette While Modal Open

1. Open help overlay (`?`)
2. Try to open command palette (`Ctrl+P`)
3. **Expected**: Help overlay closes, command palette opens (or palette takes priority)

### Test 3: Shortcuts Disabled When Palette Open

1. Open command palette (`Ctrl+P`)
2. Press other shortcuts (e.g., `q`, `p`, `j`)
3. **Expected**: Shortcuts are ignored (palette captures input for search)

### Test 4: Command Not Available

1. Ensure no runs are active
2. Open command palette (`Ctrl+P`)
3. Search for "pause"
4. **Expected**: "Pause run" either doesn't appear, or appears but is disabled/grayed out

### Test 5: Multiple Close Matches

1. Open command palette (`Ctrl+P`)
2. Type `r` (matches "run", "resume", "retry", etc.)
3. **Expected**: All matching commands shown, ranked by relevance
4. Navigate with arrow keys and select with `Enter`

---

## Automated Test Execution

Run the test suite to verify implementation:

```bash
npm test
```

**Key test files** (will be created during implementation):
- `tests/ui/components/CommandPalette.test.ts` — Component tests for palette
- `tests/ui/components/HelpOverlay.test.ts` — Component tests for help
- `tests/ui/hooks/useKeyboardShortcuts.test.ts` — Hook logic tests
- `tests/ui/hooks/useCommandPalette.test.ts` — Palette state management tests
- `tests/ui/App.test.ts` — Integration tests for keyboard handling in main app

---

## Troubleshooting

### Issue: Command palette doesn't open
- **Check**: Terminal supports Ctrl key combinations
- **Check**: No errors in console (run with `DEBUG=* node dist/index.js ui`)

### Issue: Fuzzy search doesn't filter
- **Check**: `fuzzyMatch` function is correctly implemented
- **Check**: Commands have non-empty `keywords` arrays

### Issue: Shortcuts don't work
- **Check**: Correct panel is focused (use status bar hints as reference)
- **Check**: Shortcut condition evaluates to `true` (e.g., `canPause` for pause shortcut)
- **Check**: No modal is open (modals capture input)

### Issue: Help overlay doesn't show shortcuts
- **Check**: Shortcuts are registered in the central registry
- **Check**: Context matches current focus (for context-specific shortcuts)

---

## Done When

- ✅ All validation scenarios pass manually
- ✅ Automated tests pass (`npm test`)
- ✅ No regressions in existing TUI functionality
- ✅ Status bar hints update correctly based on context
- ✅ Command palette fuzzy search works smoothly
- ✅ Help overlay displays all shortcuts accurately
