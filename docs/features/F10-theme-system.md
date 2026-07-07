# F10 - Theme System

**Epic**: [E02 - Modern TUI](../epics/E02-modern-tui.md)  
**Priority**: Low  
**Effort**: Medium

## Problem

The TUI used hardcoded colors and border styling across multiple components.
That made the interface inconsistent, difficult to adapt to different terminal
backgrounds, and impossible to configure centrally.

## Outcome

The TUI now uses a centralized semantic theme system with four built-in themes:

- `default`
- `dark`
- `light`
- `minimal`

Theme selection is persisted in `~/.config/metal-squad/config.json` through the
optional `theme` field. Unknown theme names no longer break startup; the app
falls back to `default` and surfaces a visible notice in the status bar and the
notifications feed.

## Theme Model

Each built-in theme defines:

- semantic text roles: `text`, `primary`, `success`, `warning`, `error`, `muted`, `accent`, `focus`
- shared surface styling for borders and panel emphasis
- run-status tone mapping
- notification tone mapping

Components consume those semantic roles instead of hardcoded colors.

## Configuration

```json
{
  "theme": "dark"
}
```

Valid values are `default`, `dark`, `light`, and `minimal`.

## Validation Notes

- Missing `theme` uses `default`
- Invalid `theme` uses `default` and emits a user-facing warning
- The `minimal` theme keeps warnings, failures, focus, and muted content
  distinguishable without depending on a broad color palette

## Acceptance Criteria

- [x] TUI components use shared semantic theme roles instead of fixed colors
- [x] Four built-in themes are available: `default`, `dark`, `light`, `minimal`
- [x] The theme can be configured through persistent config
- [x] Invalid configured themes fall back safely with visible feedback
