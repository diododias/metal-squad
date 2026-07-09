# Component Contracts: Detail Screen UX Improvements

**Feature**: `005-detail-screen-ux`
**Date**: 2026-07-08

## Overview

This feature modifies existing Ink component interfaces. No new external APIs or data contracts are introduced. The following component contracts define the interface changes.

---

## Contract 1: MainPanel Props Extension

**File**: `src/ui/components/MainPanel.tsx`

### Current Interface

```typescript
interface MainPanelProps {
  // ... existing props
  layoutMode: LayoutMode;
  // scroll-based section navigation
}
```

### Updated Interface

```typescript
interface MainPanelProps {
  // ... existing props
  layoutMode: LayoutMode;
  activeTab: DetailSectionId;  // NEW: replaces scroll-based index
}
```

### Behavior Changes

| Prop | Before | After |
|------|--------|-------|
| Section display | Scroll-based paging (j/k) | Tab-based switching (Tab/Shift+Tab/1-7) |
| Metric cards | Horizontal row, overflow on narrow | Responsive: stacked <80, compact 80-120, full >120 |
| Summary section | Multi-line (5 lines) | Single line with pipe separators |
| Workflow section | Rendered in body | Removed (already in header stepper) |

### Acceptance Criteria

- `activeTab` determines which `DetailSectionId` is rendered
- Tab bar displays `DETAIL_SECTION_ORDER` labels with active highlight
- Metric cards use `flexDirection: layoutMode === 'stacked' ? 'column' : 'row'`
- Metric values truncate with ellipsis via `truncateText()`

---

## Contract 2: TabBar Component (new within MainPanel)

**Location**: Inline in `src/ui/components/MainPanel.tsx` (not a separate file)

### Interface

```typescript
interface TabBarProps {
  sections: DetailSectionId[];
  activeTab: DetailSectionId;
  labels: Record<DetailSectionId, string>;
  width: number;
}
```

### Rendering

```
[Summary] [Spec] [Workflow] [Config] [Skills] [Tasks] [Output]
─────────────────────────────────────────────────────────────
^active (highlighted with focus role)
```

### Acceptance Criteria

- Active tab uses `theme.role('focus')` styling
- Inactive tabs use `theme.role('muted')` styling
- Tab labels come from `DETAIL_SECTION_LABEL`
- Tab bar fits within provided `width`

---

## Contract 3: formatHeartbeatLine Behavior Update

**File**: `src/ui/format.ts`

### Current Behavior

```
Input:  "[msq] codex feat-10 running for 42s (stdout 474569B stderr 336B idle 5s) thinking..."
Output: "thinking... codex feat-10 running 42s (idle 5s) — thinking..."
```

### Updated Behavior

```
Input:  "[msq] codex feat-10 running for 42s (stdout 474569B stderr 336B idle 5s) thinking..."
Output: "thinking..."
```

### Rules

1. If heartbeat matches `HEARTBEAT_PATTERN`: show only the `suffix` (agent activity message)
2. If `suffix` is empty: show `"thinking..."` as fallback
3. If heartbeat does NOT match pattern (error case): show raw line, truncated to `maxWidth`
4. All output truncated to `maxWidth` via `truncateText()`

---

## Contract 4: WorkflowStepper "Done" State

**File**: `src/ui/components/WorkflowStepper.tsx`

### Current Interface (unchanged)

```typescript
interface Props {
  stages: string[];
  workflowStages: WorkflowStageSummary[];
  currentStage: string | null;
  width: number;
}
```

### New Behavior

When `currentStage === null` AND all stages have `summary.done === summary.total`:

```
[✓ research] [✓ design] [✓ implement] [✓ review]  →  Done
```

The "Done" text uses `theme.role('success')` styling and appears after the last stage marker.

---

## Contract 5: KanbanCard Indentation

**File**: `src/ui/components/KanbanCard.tsx`

### Changes

| Element | Before | After |
|---------|--------|-------|
| toolModelEffort `marginLeft` | 0 | 2-4 (pendingFeature branch) |
| toolModelEffort `marginLeft` | 0 | 2-4 (run branch) |
| Card container `marginBottom` | 1 | 0 |

### Acceptance Criteria

- Tool info line visually indented under feature name
- Reduced vertical gap between cards (0-1 line)

---

## Contract 6: Shortcut Registry Extension

**File**: `src/ui/commands/runShortcuts.ts`

### New Shortcuts

| Key | Context | Action | Condition |
|-----|---------|--------|-----------|
| `tab` | run-detail | Switch to next section tab | always |
| `shift+tab` | run-detail | Switch to previous section tab | always |
| `1`-`7` | run-detail | Jump to section N (direct access) | always |

### Integration

- New shortcuts added to `createRunShortcuts()` return array
- `switchToTab` callback passed via `RunShortcutOptions`
- Tab cycling wraps around (7 → 1, 1 → 7)
