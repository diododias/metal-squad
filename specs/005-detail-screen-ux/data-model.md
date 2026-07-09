# Data Model: Detail Screen UX Improvements

**Feature**: `005-detail-screen-ux`
**Date**: 2026-07-08

## Overview

This feature modifies display behavior of existing entities. No database schema changes or new data entities are introduced. The following entities are referenced from the spec and mapped to existing code.

## Entities

### RunSummary (existing — display-only changes)

**Source**: `src/db/repo.ts` (type), displayed in `MainPanel.tsx`, `KanbanCard.tsx`

| Field | Type | Display Usage |
|-------|------|---------------|
| tool | string | Tool name display — must be consistent across views (FR-009) |
| model | string | Model name — displayed in metric card |
| status | RunStatus | Status indicator — drives STATUS_ICON and STATUS_TONE |
| tokens | number \| null | Token count — displayed in metric card |
| startedAt | string | Elapsed time calculation |
| endedAt string \| null | Elapsed time calculation |
| pipelineCurrentStage \| null | Workflow stepper position |
| pendingStageRequestKind | string \| null | Status label ("awaiting approval/input") |

**Validation**: No schema changes. Display consistency enforced by using `RunSummary.tool` uniformly.

**State transitions**: N/A — read-only display.

---

### ThemeProfile (existing — role value changes)

**Source**: `src/ui/theme/types.ts`, values in `src/ui/theme/builtins.ts`

| Role | Dark Theme Current | Dark Theme Required (FR) | Component Impact |
|------|-------------------|--------------------------|------------------|
| text | `{ color: 'white' }` | `{ color: 'white' }` | ✅ Already correct |
| muted | `{ color: '#9a9a9a' }` | `{ color: '#9a9a9a' }` | ✅ Already correct |
| accent | `{ color: 'cyan', bold: true }` | Visible accent | ✅ Already correct |
| primary | `{ color: 'blue', bold: true }` | Visible accent | ✅ Already correct |
| (borderColor) | `'blue'` | Visible accent | ✅ Already correct |

**Decision**: Theme values are correct. Component-level fixes needed to ensure roles are applied.

---

### DetailSectionId (existing — no changes)

**Source**: `src/ui/detailSections.ts`

```
'summary' | 'spec' | 'workflow' | 'config' | 'skills' | 'tasks' | 'output'
```

**Count**: 7 sections → maps to number keys 1-7 (FR-012)

**Order**: Fixed via `DETAIL_SECTION_ORDER` array. Tab navigation uses this order.

---

### WorkflowStepper (existing — add "Done" indicator)

**Source**: `src/ui/components/WorkflowStepper.tsx`

| State | Current Behavior | Required Change |
|-------|-----------------|-----------------|
| Stage in progress | Shows `▸` (focus role) | No change |
| Stage complete | Shows `✓` (success role) | No change |
| All stages complete | Shows all `✓` | Add explicit "Done" text indicator (FR-003) |

**State transition**: `currentStage === null && all stages done` → show "Done"

---

## Relationships

```
RunSummary.tool ──→ KanbanCard display
                 ──→ DetailMetric "Tool" card display
                 ──→ Live output references

ThemeProfile.roles ──→ All component text/border rendering
                    ──→ MainPanel metric cards
                    ──→ WorkflowStepper stage styling

DETAIL_SECTION_ORDER ──→ Tab navigation index
                      ──→ Number key 1-7 mapping

WorkflowStepper ──→ Pipeline progress display
               ──→ "Done" state indicator (new)
```

## Validation Rules (from spec)

1. **FR-009**: `RunSummary.tool` must be the single source of truth for tool name display
2. **FR-012**: Number keys 1-7 map to `DETAIL_SECTION_ORDER` indices 0-6
3. **FR-001**: `getLayoutMode(width)` thresholds: <80 stacked, 80-119 compact, ≥120 full
