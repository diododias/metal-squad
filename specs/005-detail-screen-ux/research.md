# Research: Detail Screen UX Improvements

**Feature**: `005-detail-screen-ux`
**Date**: 2026-07-08

## Research Tasks

### R1: Dark Theme Color Values

**Question**: Are the spec's required dark theme colors (FR-006 white text, FR-008 #9a9a9a muted) already implemented?

**Findings**: Yes. `src/ui/theme/builtins.ts:68-85` defines the `dark` theme with:
- `text: { color: 'white' }` — matches FR-006
- `muted: { color: '#9a9a9a' }` — matches FR-008
- `accent: { color: 'cyan', bold: true }` — matches FR-007 (accent color for borders/headers)
- `borderColor: 'blue'` — visible accent for dark backgrounds

**Decision**: No color value changes needed in `builtins.ts`. The fix must be in component rendering — ensuring components actually use theme roles instead of hardcoded colors.

**Rationale**: The theme system is already correct. The problem is likely component-level: some components may not be consuming theme roles for borders/headers.

**Alternatives considered**: N/A — theme values already match spec.

---

### R2: Heartbeat Diagnostic Pattern

**Question**: What is the exact format of heartbeat diagnostic lines, and how are they currently processed?

**Findings**: `src/ui/format.ts:85` defines the regex pattern:
```
/[msq] <label> running for Ns (stdout XB stderr YB idle Zs) <suffix>/
```

The current `formatHeartbeatLine()` function (line 87-93) already condenses this into:
```
thinking... <label> running Ns (idle Zs) — <suffix>
```

**Decision**: FR-010 requires hiding ALL diagnostic details (including idle time). The current implementation still shows `running Ns (idle Zs)`. The fix is to strip the remaining diagnostic fields and show only the agent's activity message.

**Rationale**: The spec explicitly says "hiding diagnostic metrics" — idle time is a diagnostic metric.

**Alternatives considered**: Keep idle time visible — rejected per spec requirement.

---

### R3: Layout Mode Implementation

**Question**: Does the codebase already have responsive layout logic?

**Findings**: `src/ui/format.ts:95-99` defines `getLayoutMode(width)`:
- `< 80` → `'stacked'`
- `80–119` → `'compact'`
- `≥ 120` → `'full'`

This matches FR-001's thresholds exactly.

**Decision**: Layout mode logic exists. The task is to wire `MainPanel.tsx` metric cards to use `flexDirection` based on `layoutMode` and add ellipsis truncation.

**Rationale**: Infrastructure is in place; only component rendering needs updating.

**Alternatives considered**: N/A — existing logic matches spec.

---

### R4: WorkflowStepper "Done" State

**Question**: Does the WorkflowStepper already show a "Done" indicator?

**Findings**: `src/ui/components/WorkflowStepper.tsx:15-24` marks individual stages as `'done'` (✓) when `summary.done === summary.total`. However, there is no explicit "Done" label for the entire workflow completion — FR-003 requires a "Done" indicator when ALL stages are complete.

**Decision**: Add a final "Done" text/indicator that appears when the workflow stepper has no `currentStage` and all stages are marked done.

**Rationale**: Individual stage checkmarks exist, but the spec wants a distinct "Done" state for the overall workflow.

**Alternatives considered**: Reuse existing ✓ icons — rejected; spec calls for explicit "Done" text.

---

### R5: Number Key Conflicts

**Question**: Are keys 1-7 already bound in run-detail context?

**Findings**: `src/ui/commands/runShortcuts.ts` binds: `p`, `x`, `k`, `up`, `j`, `down`, `pageup`, `pagedown`, `i`. No number keys are bound.

`src/ui/commands/viewShortcuts.ts`, `gatesShortcuts.ts`, and `globalShortcuts.ts` were also checked — no 1-7 bindings found.

**Decision**: Keys 1-7 are safe to bind for direct section access (FR-012).

**Rationale**: No conflicts with existing shortcuts.

**Alternatives considered**: N/A — no conflicts exist.

---

### R6: DetailSectionId Count

**Question**: How many detail sections exist? Does it match the spec's "1-7" keybinding range?

**Findings**: `src/ui/detailSections.ts` defines exactly 7 sections:
`summary`, `spec`, `workflow`, `config`, `skills`, `tasks`, `output`

**Decision**: 7 sections = 7 number keys. Direct 1:1 mapping is valid.

**Rationale**: The spec's "1-7" range matches the actual section count.

**Alternatives considered**: N/A — count matches.

---

### R7: KanbanCard Tool Display

**Question**: Is there a tool/model naming inconsistency in the codebase?

**Findings**: `src/ui/components/KanbanCard.tsx` displays tool info via `toolModelEffort()`. The spec (US5) identifies a potential mismatch between kanban card, detail header, and live output tool names. This is a frontend display issue — the database stores the correct tool name.

**Decision**: Audit the three display locations to ensure they all read from `RunSummary.tool` (not `model` or another field).

**Rationale**: The spec confirms the database is the source of truth; the fix is in display code.

**Alternatives considered**: N/A — this is a display-layer fix.
