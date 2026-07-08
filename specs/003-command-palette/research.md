# Research: Command Palette & Keyboard Shortcuts

**Feature**: 003-command-palette  
**Date**: 2026-07-07  
**Status**: Complete

## Overview

This document consolidates research findings for implementing a command palette with fuzzy search and comprehensive keyboard shortcuts in the metal-squad TUI.

---

## Research Task 1: Fuzzy Search Library Selection

**Question**: Which fuzzy search library should be used for command palette filtering, considering performance, bundle size, and ranking quality?

### Decision: `fzy.js` (or similar lightweight algorithm)

**Rationale**:
- **Lightweight**: No external dependencies needed — we can implement a simple fuzzy matching algorithm inline (similar to fzy algorithm)
- **Performance**: For ~15-20 commands, even a naive O(n*m) fuzzy match per keystroke is <1ms
- **Ranking Quality**: Simple substring + character order matching is sufficient for small command sets
- **Alternatives Considered**:
  - `fuse.js` (14KB gzipped) — overkill for <20 items, adds unnecessary dependency
  - `fzf-for-js` — high-quality but requires native bindings, not suitable for pure Node.js
  - Custom implementation inspired by VSCode's `fuzzyMatch` — best fit for our use case

**Implementation Approach**:
- Implement a lightweight fuzzy matcher utility in `src/ui/utils/fuzzyMatch.ts`
- Algorithm: check if all characters from query appear in target string in order (case-insensitive)
- Scoring: prioritize matches with consecutive characters, word boundaries, and earlier positions
- No external library needed

**References**:
- VSCode's fuzzy matching: https://github.com/microsoft/vscode/blob/main/src/vs/base/common/filters.ts
- fzy algorithm explanation: https://github.com/jhawthorn/fzy/blob/master/ALGORITHM.md

---

## Research Task 2: Ink Modal Pattern for Overlays

**Question**: What is the best pattern for implementing modal overlays (command palette, help) in Ink?

### Decision: Conditional Rendering with `Box` z-index layering

**Rationale**:
- Ink does not have built-in modal/dialog primitives
- Standard pattern: conditionally render overlay components at the top level of the component tree
- Use `Box` with absolute positioning (via padding/margin) to overlay content
- Capture input focus by rendering overlay last (Ink processes `useInput` hooks in render order)

**Implementation Approach**:
```tsx
// In App.tsx
return (
  <Box flexDirection="column">
    {/* Main content */}
    <MainPanel ... />
    <Sidebar ... />
    
    {/* Overlays (rendered last to capture input) */}
    {commandPaletteOpen && <CommandPalette ... />}
    {helpOverlayOpen && <HelpOverlay ... />}
  </Box>
);
```

**Key Considerations**:
- Overlays should use `useInput` to capture keyboard events and prevent propagation to underlying components
- Close on `Esc` key
- Use `Box` with border and background color to visually separate from main content
- Center overlay using flexbox or manual padding calculations based on terminal width

**References**:
- Ink examples: https://github.com/vadimdemedes/ink/tree/master/examples
- Similar pattern used in `ink-select-input` and `ink-text-input` packages

---

## Research Task 3: Keyboard Event Handling Architecture

**Question**: How should keyboard shortcuts be centrally managed across different contexts (global vs context-specific)?

### Decision: Custom `useKeyboardShortcuts` hook with context-aware handler registry

**Rationale**:
- Current implementation has all keyboard logic inline in `App.tsx` (150+ lines of input handling)
- Need separation of concerns: each context (runs, gates, main) should declare its own shortcuts
- Centralized registry prevents conflicts and enables help overlay generation
- Hook-based approach fits React/Ink patterns

**Implementation Approach**:

1. **Shortcut Registry Data Structure**:
```typescript
interface ShortcutDefinition {
  key: string;              // e.g., 'p', 'ctrl+p', 'enter'
  scope: 'global' | 'context';
  context?: string;         // e.g., 'gates', 'runs', 'run-detail'
  label: string;            // e.g., 'Pause run'
  action: () => void;
  condition?: () => boolean; // e.g., () => canPause
}
```

2. **Hook API**:
```typescript
const { registerShortcut, unregisterShortcut } = useKeyboardShortcuts({
  currentContext: focusPanel,
  enabled: !commandPaletteOpen && !helpOverlayOpen,
});
```

3. **Registration Pattern**:
```typescript
// In App.tsx or child components
useEffect(() => {
  if (canPause) {
    registerShortcut({
      key: 'p',
      scope: 'context',
      context: 'runs',
      label: 'Pause run',
      action: () => pausePipeline(selectedRun.pipelineId),
    });
  }
  return () => unregisterShortcut('p', 'runs');
}, [canPause, selectedRun]);
```

**Alternatives Considered**:
- **Command pattern with action map**: More complex, harder to reason about context switching
- **Separate `useInput` in each component**: Risk of conflicts, no central registry for help overlay
- **Keep inline in App.tsx**: Does not scale, hard to maintain

**Trade-offs**:
- Hook-based approach adds abstraction but improves maintainability
- Context switching logic is explicit and testable
- Help overlay and status bar hints can be auto-generated from registry

**References**:
- React hook patterns: https://react.dev/reference/react/hooks
- VSCode keybindings system (for inspiration): https://code.visualstudio.com/docs/getstarted/keybindings

---

## Research Task 4: Command Palette Command Availability Logic

**Question**: How should the command palette determine which commands are available/enabled in the current application state?

### Decision: Command objects with `available` predicate functions

**Rationale**:
- Each command needs to know when it can be executed (e.g., "pause" only when a run is active)
- Declarative approach: commands declare their availability condition
- Allows command palette to filter/disable unavailable commands dynamically
- Same predicates can be used for keyboard shortcuts and command palette

**Implementation Approach**:

1. **Command Definition**:
```typescript
interface Command {
  id: string;                    // e.g., 'run-pause'
  name: string;                  // e.g., 'Pause run'
  category: 'run' | 'gate' | 'system' | 'view';
  keywords: string[];            // e.g., ['pause', 'stop', 'suspend']
  shortcut?: string;             // e.g., 'p' (if has keyboard shortcut)
  available: () => boolean;      // Availability predicate
  execute: () => void;           // Command action
}
```

2. **Command Registry**:
```typescript
// In App.tsx or separate commands module
const commands: Command[] = [
  {
    id: 'run-pause',
    name: 'Pause run',
    category: 'run',
    keywords: ['pause', 'stop', 'suspend'],
    shortcut: 'p',
    available: () => canPause,
    execute: () => pausePipeline(selectedRun.pipelineId),
  },
  {
    id: 'run-resume',
    name: 'Resume run',
    category: 'run',
    keywords: ['resume', 'continue', 'unpause'],
    shortcut: 'r',
    available: () => canResume,
    execute: () => resumePipeline(selectedRun.pipelineId),
  },
  // ... more commands
];
```

3. **Filtering in Command Palette**:
```typescript
const availableCommands = commands.filter(cmd => cmd.available());
const filteredCommands = fuzzyMatch(availableCommands, query);
```

**Benefits**:
- Single source of truth for command availability
- Commands are self-contained and testable
- Easy to add new commands without touching multiple files
- Command palette and keyboard shortcuts share same logic

**References**:
- Command pattern: https://refactoring.guru/design-patterns/command
- VSCode command palette implementation concepts

---

## Research Task 5: Best Practices for Ink TUI Testing

**Question**: How should we test command palette and keyboard shortcut functionality in Vitest?

### Decision: Component snapshot testing + integration tests with `ink-testing-library`

**Rationale**:
- Ink components are React components, so standard React testing patterns apply
- `ink-testing-library` (community package) provides utilities for testing Ink apps
- Focus on integration tests (simulate key presses, verify output) rather than unit tests

**Implementation Approach**:

1. **Install** (if not already present):
```bash
npm install --save-dev ink-testing-library
```

2. **Component Tests**:
```typescript
import { render } from 'ink-testing-library';
import { CommandPalette } from './CommandPalette';

test('command palette filters commands by query', () => {
  const commands = [
    { id: 'pause', name: 'Pause run', keywords: ['pause'], available: () => true, execute: vi.fn() },
    { id: 'resume', name: 'Resume run', keywords: ['resume'], available: () => true, execute: vi.fn() },
  ];
  
  const { lastFrame, stdin } = render(<CommandPalette commands={commands} onClose={vi.fn()} />);
  
  stdin.write('pau');
  expect(lastFrame()).toContain('Pause run');
  expect(lastFrame()).not.toContain('Resume run');
});
```

3. **Keyboard Shortcut Integration Tests**:
```typescript
import { render } from 'ink-testing-library';
import { App } from './App';

test('pressing p pauses the active run', () => {
  const { stdin } = render(<App />);
  
  // Setup: ensure there's an active run
  // ...
  
  stdin.write('p');
  
  // Assert: pausePipeline was called
  expect(mockPausePipeline).toHaveBeenCalledWith(expectedPipelineId);
});
```

**Alternatives Considered**:
- **Manual mocking without library**: More control but repetitive boilerplate
- **E2E tests with real terminal**: Too slow, brittle, hard to CI
- **Snapshot tests only**: Not sufficient for interactive behavior

**References**:
- ink-testing-library: https://github.com/vadimdemedes/ink-testing-library
- Ink testing docs: https://github.com/vadimdemedes/ink#testing

---

## Summary

All technical clarifications have been resolved:

1. **Fuzzy search**: Implement lightweight inline algorithm (no external dependency)
2. **Modal overlays**: Use conditional rendering with Box layering
3. **Keyboard architecture**: Custom `useKeyboardShortcuts` hook with context-aware registry
4. **Command availability**: Command objects with `available()` predicates
5. **Testing strategy**: Use `ink-testing-library` for integration tests

Next phase: Design (data model, contracts, quickstart).
