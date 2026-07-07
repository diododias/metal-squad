# Data Model: Command Palette & Keyboard Shortcuts

**Feature**: 003-command-palette  
**Date**: 2026-07-07  
**Status**: Complete

## Overview

This document defines the core entities and data structures for the command palette and keyboard shortcuts system.

---

## Entity 1: Command

Represents an executable action available in the TUI.

### Attributes

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | ✅ | Unique command identifier (e.g., `'run-pause'`, `'gate-approve'`) |
| `name` | `string` | ✅ | Human-readable command name (e.g., `'Pause run'`, `'Approve gate'`) |
| `description` | `string` | ❌ | Optional detailed description for help overlay |
| `category` | `CommandCategory` | ✅ | Command category for grouping: `'run' \| 'gate' \| 'system' \| 'view'` |
| `keywords` | `string[]` | ✅ | Search keywords for fuzzy matching (e.g., `['pause', 'stop', 'suspend']`) |
| `shortcut` | `string \| null` | ❌ | Keyboard shortcut if available (e.g., `'p'`, `'ctrl+p'`, `null` if no shortcut) |
| `available` | `() => boolean` | ✅ | Predicate function determining if command is currently executable |
| `execute` | `() => void` | ✅ | Command execution function |

### Relationships

- A `Command` may have zero or one `KeyboardShortcut` (via `shortcut` field)
- A `Command` belongs to exactly one `CommandCategory`

### Validation Rules

- `id` must be unique across all commands
- `keywords` must contain at least one non-empty string
- `available` must return a boolean value
- `execute` must be a valid function

### State Transitions

Not applicable (commands are stateless definitions)

### Example

```typescript
const pauseCommand: Command = {
  id: 'run-pause',
  name: 'Pause run',
  description: 'Pause the currently running pipeline',
  category: 'run',
  keywords: ['pause', 'stop', 'suspend'],
  shortcut: 'p',
  available: () => selectedRun?.pipelineStatus === 'running',
  execute: () => pausePipeline(selectedRun.pipelineId),
};
```

---

## Entity 2: KeyboardShortcut

Represents a key binding mapped to a command or action.

### Attributes

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | `string` | ✅ | Key combination (e.g., `'p'`, `'ctrl+p'`, `'enter'`, `'escape'`) |
| `scope` | `ShortcutScope` | ✅ | Shortcut scope: `'global' \| 'context'` |
| `context` | `string \| null` | ❌ | Context name if scope is `'context'` (e.g., `'gates'`, `'runs'`, `'run-detail'`), `null` if global |
| `label` | `string` | ✅ | Human-readable label for help display (e.g., `'Pause run'`, `'Approve gate'`) |
| `condition` | `(() => boolean) \| null` | ❌ | Optional availability condition (e.g., `() => canPause`) |
| `action` | `() => void` | ✅ | Action to execute when shortcut is triggered |

### Relationships

- A `KeyboardShortcut` may reference a `Command` (via shared `action` and `condition`)
- A `KeyboardShortcut` belongs to exactly one `Context` (if scope is `'context'`)

### Validation Rules

- `key` must be a valid Ink key identifier
- If `scope === 'context'`, then `context` must be non-null
- If `scope === 'global'`, then `context` must be null
- `condition` (if present) must return a boolean value

### State Transitions

Not applicable (shortcuts are stateless bindings)

### Example

```typescript
const pauseShortcut: KeyboardShortcut = {
  key: 'p',
  scope: 'context',
  context: 'runs',
  label: 'Pause run',
  condition: () => canPause,
  action: () => pausePipeline(selectedRun.pipelineId),
};
```

---

## Entity 3: FocusContext

Represents the current focused panel or view, determining which context-specific shortcuts are active.

### Attributes

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | `string` | ✅ | Context identifier (e.g., `'runs'`, `'gates'`, `'main'`, `'run-detail'`) |
| `activeShortcuts` | `KeyboardShortcut[]` | ✅ | List of shortcuts active in this context (computed from registry) |
| `statusBarHints` | `string[]` | ✅ | Shortcut hints to display in status bar (computed from `activeShortcuts`) |

### Relationships

- A `FocusContext` has many `KeyboardShortcut` (context-specific shortcuts)
- The application has exactly one active `FocusContext` at any time

### Validation Rules

- `name` must be unique across all contexts
- `activeShortcuts` must only contain shortcuts where `scope === 'global'` OR `(scope === 'context' && context === this.name)`

### State Transitions

```
runs ──(Tab)──> gates ──(Tab)──> main ──(Tab)──> runs
  │                                       │
  └──────────────(Enter on run)──────────┘
                      ↓
                  run-detail
                      ↓
                  (Escape)
                      ↓
                    runs
```

### Example

```typescript
const gatesContext: FocusContext = {
  name: 'gates',
  activeShortcuts: [
    { key: 'a', scope: 'context', context: 'gates', label: 'Approve', ... },
    { key: 's', scope: 'context', context: 'gates', label: 'Skip', ... },
    { key: 'r', scope: 'context', context: 'gates', label: 'Retry', ... },
    // ... plus all global shortcuts
  ],
  statusBarHints: ['a:approve', 's:skip', 'r:retry', '?:help'],
};
```

---

## Entity 4: CommandPaletteState

Represents the state of the command palette UI.

### Attributes

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | `boolean` | ✅ | Whether the command palette is currently visible |
| `query` | `string` | ✅ | Current search query entered by user |
| `filteredCommands` | `Command[]` | ✅ | Commands matching the current query (computed from fuzzy search) |
| `selectedIndex` | `number` | ✅ | Index of currently highlighted command in `filteredCommands` |

### Relationships

- `CommandPaletteState` references many `Command` (via `filteredCommands`)

### Validation Rules

- `selectedIndex` must be within bounds `[0, filteredCommands.length - 1]` (or `0` if empty)
- `query` can be empty string (shows all available commands)

### State Transitions

```
closed ──(Ctrl+P or :)──> open (query='', selectedIndex=0)
  ↑                             │
  │                             │ (type query)
  │                             ↓
  │                         filtering (updates filteredCommands)
  │                             │
  │                             │ (↑/↓ arrows or j/k)
  │                             ↓
  │                         navigating (updates selectedIndex)
  │                             │
  │                             │ (Enter)
  │                             ↓
  └─────(command executed)── execute & close
          
          (Escape at any point) ──> close
```

### Example

```typescript
const paletteState: CommandPaletteState = {
  isOpen: true,
  query: 'pau',
  filteredCommands: [
    pauseCommand,  // matches 'pau' in 'pause'
  ],
  selectedIndex: 0,
};
```

---

## Entity 5: HelpOverlayState

Represents the state of the help overlay UI.

### Attributes

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | `boolean` | ✅ | Whether the help overlay is currently visible |
| `currentContext` | `string` | ✅ | Current focus context (e.g., `'gates'`, `'runs'`) to highlight relevant shortcuts |
| `globalShortcuts` | `KeyboardShortcut[]` | ✅ | List of global shortcuts to display |
| `contextShortcuts` | `KeyboardShortcut[]` | ✅ | List of context-specific shortcuts for current context |

### Relationships

- `HelpOverlayState` references many `KeyboardShortcut` (via `globalShortcuts` and `contextShortcuts`)

### Validation Rules

- `globalShortcuts` must only contain shortcuts where `scope === 'global'`
- `contextShortcuts` must only contain shortcuts where `scope === 'context'` AND `context === currentContext`

### State Transitions

```
closed ──(?)──> open
  ↑               │
  │               │ (? or Escape)
  └───────────────┘
```

### Example

```typescript
const helpState: HelpOverlayState = {
  isOpen: true,
  currentContext: 'gates',
  globalShortcuts: [
    { key: 'q', scope: 'global', label: 'Quit', ... },
    { key: 'tab', scope: 'global', label: 'Cycle focus', ... },
    // ... other global shortcuts
  ],
  contextShortcuts: [
    { key: 'a', scope: 'context', context: 'gates', label: 'Approve', ... },
    { key: 's', scope: 'context', context: 'gates', label: 'Skip', ... },
    { key: 'r', scope: 'context', context: 'gates', label: 'Retry', ... },
  ],
};
```

---

## Type Definitions

```typescript
// Core types
type CommandCategory = 'run' | 'gate' | 'system' | 'view';
type ShortcutScope = 'global' | 'context';
type FocusPanel = 'runs' | 'gates' | 'main';

// Entity interfaces
interface Command {
  id: string;
  name: string;
  description?: string;
  category: CommandCategory;
  keywords: string[];
  shortcut?: string | null;
  available: () => boolean;
  execute: () => void;
}

interface KeyboardShortcut {
  key: string;
  scope: ShortcutScope;
  context?: string | null;
  label: string;
  condition?: (() => boolean) | null;
  action: () => void;
}

interface FocusContext {
  name: string;
  activeShortcuts: KeyboardShortcut[];
  statusBarHints: string[];
}

interface CommandPaletteState {
  isOpen: boolean;
  query: string;
  filteredCommands: Command[];
  selectedIndex: number;
}

interface HelpOverlayState {
  isOpen: boolean;
  currentContext: string;
  globalShortcuts: KeyboardShortcut[];
  contextShortcuts: KeyboardShortcut[];
}
```

---

## Summary

Five core entities model the command palette and keyboard shortcuts system:

1. **Command**: Executable actions discoverable via palette
2. **KeyboardShortcut**: Key bindings with scope and context
3. **FocusContext**: Active panel determining which shortcuts are enabled
4. **CommandPaletteState**: UI state for command palette modal
5. **HelpOverlayState**: UI state for help overlay modal

These entities are in-memory React state — no database persistence required.
