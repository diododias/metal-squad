# Quickstart: Theme System

**Feature**: 004-theme-system
**Date**: 2026-07-07

## Overview

This guide defines the validation flow for the TUI theme system. It focuses on theme selection, fallback behavior, semantic consistency, and readability of the four built-in themes.

## Prerequisites

1. Build the project:
   ```bash
   rtk npm run build
   ```

2. Use a writable local database path for validation:
   ```bash
   export MSQ_DB_PATH="$(pwd)/.metal-squad/app.db"
   ```

3. Ensure `~/.config/metal-squad/config.json` exists. If it does not, run:
   ```bash
   MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js status
   ```

4. Keep at least one feature in `backlog.yaml` so the TUI renders normal board content.

## Validation Scenario 1: Default theme when no preference is configured

**Goal**: Verify startup uses the default theme when the config omits `theme`.

### Steps

1. Open `~/.config/metal-squad/config.json`.
2. Remove the `theme` field if present, leaving the rest of the config intact.
3. Start the TUI:
   ```bash
   MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js ui
   ```
4. Inspect headings, panel borders, status colors, and muted helper text.

### Expected Outcome

- The TUI starts successfully.
- The appearance matches the default built-in theme.
- No fallback warning is shown because the preference is simply missing.

## Validation Scenario 2: Switch between built-in themes

**Goal**: Verify the selected built-in theme is applied after a normal restart.

### Steps

1. Edit `~/.config/metal-squad/config.json` and set:
   ```json
   {
     "theme": "dark"
   }
   ```
   If the file already contains other properties, add `"theme": "dark"` without removing them.
2. Start the TUI with `MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js ui`.
3. Confirm the dark theme is applied across:
   - overview header and panel borders
   - run status labels
   - notifications feed
   - muted helper text
4. Exit the TUI.
5. Repeat the process with `light` and `minimal`.

### Expected Outcome

- Each restart applies the selected built-in theme consistently.
- Visual changes are noticeable between `default`, `dark`, `light`, and `minimal`.
- Semantic states remain distinguishable in all four themes.

## Validation Scenario 3: Invalid configured theme falls back safely

**Goal**: Verify an unknown theme name does not break the TUI and instead falls back to `default`.

### Steps

1. Edit `~/.config/metal-squad/config.json` and set:
   ```json
   {
     "theme": "solarized"
   }
   ```
2. Start the TUI:
   ```bash
   MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js ui
   ```
3. Check the visible UI feedback area (status/notification output) for the fallback notice.
4. Inspect the board styling.

### Expected Outcome

- The TUI still starts successfully.
- The active appearance is the default theme, not a broken or partial theme.
- The user receives a clear notice that `solarized` is unsupported and `default` was used instead.

## Validation Scenario 4: Semantic consistency across components

**Goal**: Verify semantic roles, not hardcoded colors, drive the UI.

### Steps

1. Start the TUI with one non-default theme (`dark` or `light` is easiest to compare).
   Use `MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js ui`.
2. Review these component groups under the same run state:
   - `RunTable` and `StatusBar`
   - `Sidebar` workflow/status summaries
   - `MainPanel` overview counts and run detail metrics
   - `NotificationsFeed`
   - `HelpOverlay` and `CommandPalette`
3. Trigger representative states where possible:
   - running
   - done
   - failed
   - blocked
   - aborted

### Expected Outcome

- The same semantic state uses the same theme-defined treatment everywhere.
- Focus and selection states share a common primary/focus treatment.
- Muted helper text remains visually secondary without disappearing.

## Validation Scenario 5: Minimal theme readability

**Goal**: Verify the `minimal` theme preserves hierarchy and status cues in constrained environments.

### Steps

1. Set `"theme": "minimal"` in `config.json`.
2. Start the TUI:
   ```bash
   MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js ui
   ```
3. Inspect:
   - panel separation and focus indicators
   - running/done/failed/blocked status visibility
   - notifications feed labels
   - help text and empty states

### Expected Outcome

- The interface remains understandable without relying on a broad color palette.
- Critical warning and failure states are still distinguishable from neutral text.
- Focused elements are visibly different from unfocused ones.

## Suggested Automated Checks

Run targeted tests after implementation:

```bash
rtk npx vitest run tests/config/index.test.ts tests/ui/app.test.ts tests/ui/render.test.tsx tests/ui/components.test.tsx tests/ui/theme.test.ts
```

These tests should cover the contract described in [`contracts/theme-system.ts`](./contracts/theme-system.ts) and the entities described in [`data-model.md`](./data-model.md).
