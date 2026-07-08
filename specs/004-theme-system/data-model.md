# Data Model: Theme System

**Feature**: 004-theme-system
**Date**: 2026-07-07
**Status**: Complete

## Overview

This document defines the core entities for configuring, resolving, and consuming TUI themes in `metal-squad`.

## Entity 1: ThemePreference

Represents the persisted user input stored in the existing config file.

### Attributes

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `theme` | `string | undefined` | No | Raw configured theme name from `config.json` |

### Relationships

- A `ThemePreference` resolves to exactly one `ThemeResolution`

### Validation Rules

- Missing `theme` means "use the default theme"
- Unknown strings are allowed as input so the app can recover gracefully

### Example

```json
{
  "theme": "dark"
}
```

## Entity 2: ThemeResolution

Represents the startup-time result of resolving the raw preference into an active built-in theme.

### Attributes

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `requested` | `string | null` | Yes | Raw configured theme name, or `null` when omitted |
| `active` | `ThemeName` | Yes | Built-in theme actually used by the TUI |
| `fallbackReason` | `'missing' \| 'unknown' \| null` | Yes | Why fallback occurred, if any |
| `message` | `string | null` | Yes | User-facing notice shown when fallback occurs |

### Relationships

- A `ThemeResolution` references exactly one `ThemeProfile`
- A `ThemeResolution` is derived from one `ThemePreference`

### Validation Rules

- `active` must always be one of `default`, `dark`, `light`, `minimal`
- `fallbackReason === null` when `requested` matches a supported built-in name
- `message` is non-null when `fallbackReason === 'unknown'`

### State Transitions

```text
missing preference -> active=default
valid preference -> active=requested theme
unknown preference -> active=default + warning notice
```

## Entity 3: ThemeInkStyle

Represents a reusable Ink-compatible styling token for text or emphasis.

### Attributes

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `color` | `string | undefined` | No | Ink text color name or color value |
| `backgroundColor` | `string | undefined` | No | Ink background color value when needed |
| `bold` | `boolean | undefined` | No | Whether the token implies bold emphasis |
| `dimColor` | `boolean | undefined` | No | Whether the token implies muted/dim text |
| `inverse` | `boolean | undefined` | No | Whether the token should invert foreground/background |

### Relationships

- A `ThemeInkStyle` can be referenced by many semantic roles within a `ThemeProfile`

### Validation Rules

- At least one styling property must be set
- `dimColor` and `inverse` can be combined only when the resulting state remains readable

### Example

```typescript
const warningStyle = { color: 'yellow', bold: true };
```

## Entity 4: ThemeRole

Represents a semantic styling slot consumed by TUI components.

### Attributes

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | `ThemeRoleName` | Yes | Semantic role name such as `primary`, `success`, `warning`, `error`, `muted`, `accent`, `focus`, or `text` |
| `style` | `ThemeInkStyle` | Yes | Ink-compatible style token used when the role is requested |

### Relationships

- A `ThemeRole` belongs to exactly one `ThemeProfile`
- A `ThemeProfile` contains many `ThemeRole` entries

### Validation Rules

- Every built-in profile must provide the full required role set
- Components must reference roles by name and never bypass them with ad hoc colors

### Example

```typescript
const primaryRole = { name: 'primary', style: { color: 'cyan', bold: true } };
```

## Entity 5: ThemeProfile

Represents a built-in theme bundle that defines semantic roles and surface behavior for the TUI.

### Attributes

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | `ThemeName` | Yes | Built-in identifier: `default`, `dark`, `light`, or `minimal` |
| `label` | `string` | Yes | Human-readable theme label |
| `description` | `string` | Yes | Short explanation of intended usage |
| `roles` | `Record<ThemeRoleName, ThemeInkStyle>` | Yes | Semantic theme role map |
| `surfaceBorderColor` | `string` | Yes | Default border color for panels and framed sections |
| `surfaceBackgroundMode` | `'terminal' \| 'filled' \| 'inverse'` | Yes | How the theme treats panel/background emphasis |
| `statusRoleByRun` | `Record<RunStatus, ThemeRoleName>` | Yes | Maps run states to semantic roles |
| `notificationRoleByEvent` | `Record<NotificationTone, ThemeRoleName>` | Yes | Maps notification/event classes to semantic roles |

### Relationships

- A `ThemeProfile` contains many `ThemeRole` entries
- A `ThemeResolution` activates one `ThemeProfile`

### Validation Rules

- All four built-in names must exist exactly once
- `statusRoleByRun` must cover `running`, `done`, `failed`, `blocked`, and `aborted`
- `surfaceBackgroundMode` for `minimal` must avoid dependence on broad background fills

### Example

```typescript
const defaultTheme = {
  name: 'default',
  label: 'Default',
  description: 'Preserves the current cyan/green/yellow/red-heavy appearance.',
  roles: {
    text: { color: 'white' },
    primary: { color: 'cyan', bold: true },
    success: { color: 'green' },
    warning: { color: 'yellow' },
    error: { color: 'red' },
    muted: { dimColor: true },
    accent: { color: 'magenta' },
    focus: { color: 'cyan', bold: true },
  },
  surfaceBorderColor: 'cyan',
  surfaceBackgroundMode: 'terminal',
  statusRoleByRun: {
    running: 'primary',
    done: 'success',
    failed: 'error',
    blocked: 'warning',
    aborted: 'accent',
  },
};
```
