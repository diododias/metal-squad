# Quickstart: Detail Screen UX Improvements

**Feature**: `005-detail-screen-ux`
**Date**: 2026-07-08

## Prerequisites

- Node.js >= 20.17.0
- Terminal with dark background theme (for theme validation)

## Setup

```bash
git checkout 005-detail-screen-ux
npm install
npm run build
```

## Validation Scenarios

### VS-001: Dark Theme Readability (US4 — P1, blocking)

```bash
# Set terminal to dark background, then:
npm run dev
# Open any run detail screen
# Verify:
#   - All body text is white (#ffffff)
#   - Section headers/borders use accent colors (cyan, blue, green)
#   - Muted/secondary text is light gray (#9a9a9a), not dark
```

**Expected**: All text clearly visible on dark background. No invisible or dark-on-dark text.

---

### VS-002: Responsive Layout (US1 — P1)

```bash
npm run dev
# 1. Resize terminal to 80 columns or less
#    → Metric cards should arrange vertically (stacked mode)
#    → No horizontal overflow or scrolling
# 2. Resize terminal to 120+ columns
#    → Metric cards arrange in horizontal row (full mode)
# 3. Verify text truncates with ellipsis when content exceeds width
```

**Expected**: Layout adapts to terminal width. No overflow at any size ≥40 columns.

---

### VS-003: Tab Navigation (US2 — P1)

```bash
npm run dev
# Open a run detail screen
# 1. Press Tab → cycles to next section
# 2. Press Shift+Tab → cycles to previous section
# 3. Press 1-7 → jumps directly to that section
# 4. Verify active tab is visually highlighted
# 5. Verify "Done" indicator appears when workflow is complete
```

**Expected**: Direct section access in 1 keypress. Active tab clearly highlighted.

---

### VS-004: Compact Summary (US3 — P2)

```bash
npm run dev
# Open a run detail screen
# Verify summary section shows all metrics on 1 line with pipe separators
# Example: "✓ | codex | 2.3k tokens | 45s elapsed | 45% context"
```

**Expected**: Summary is 1 line (not 5 lines). 80% vertical space saved.

---

### VS-005: Consistent Tool Naming (US5 — P2)

```bash
npm run dev
# Start a run with a specific tool (e.g., codex)
# Check: Kanban card shows "codex"
# Check: Detail header Tool card shows "codex"
# Check: Live output references show "codex"
```

**Expected**: Same tool name in all three views. No mismatch.

---

### VS-006: Clean Heartbeat (US6 — P3)

```bash
npm run dev
# Start a run and observe live output during execution
# Verify heartbeats show only agent activity (e.g., "thinking...")
# Verify diagnostic data (stdout=...B stderr=...B idle=...s) is hidden
# Verify error heartbeats still show diagnostic details
```

**Expected**: Heartbeat lines are clean and readable. Diagnostic noise hidden for normal operation.

---

### VS-007: Indented Tool Cards (US7 — P3)

```bash
npm run dev
# View kanban board
# Verify tool/model/effort line is indented 2-4 spaces under feature name
# Verify vertical spacing between cards is minimal (0-1 line)
```

**Expected**: Clean visual hierarchy with indented tool info.

---

## Edge Cases

### EC-001: Narrow Terminal (<40 columns)
```bash
npm run dev
# Resize terminal to <40 columns
# Verify graceful degradation (truncation, no crash)
```

### EC-002: Empty Sections in Tab Navigation
```bash
npm run dev
# Navigate to a section with no content (e.g., empty tasks)
# Verify empty state is shown or section is skipped
```

### EC-003: Null Tool Name
```bash
npm run dev
# View a run with null/empty tool name
# Verify fallback display (e.g., "—" or "unknown")
```
