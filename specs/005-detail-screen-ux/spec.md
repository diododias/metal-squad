# Feature Specification: Detail Screen UX Improvements

**Feature Branch**: `005-detail-screen-ux`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "Multiple UI/UX improvements for the detail screen including layout optimization, tab navigation, color fixes, and heartbeat simplification"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compact Detail Layout (Priority: P1)

As a user viewing a run's detail screen on a small terminal, I want the layout to adapt responsively so that all information is visible without horizontal scrolling or overflow.

**Why this priority**: Small screen usability is fundamental - if content overflows, the app becomes unusable on common laptop terminal sizes.

**Independent Test**: Resize terminal to 80 columns or less, open a run detail, verify all elements fit within bounds.

**Acceptance Scenarios**:

1. **Given** a terminal width of 80 columns, **When** user opens run detail, **Then** all metric cards (Status, Tool, Model, Tokens, etc.) arrange vertically or in a compact grid without overflow
2. **Given** a terminal width of 120+ columns, **When** user opens run detail, **Then** metric cards arrange in a horizontal row utilizing available space
3. **Given** any terminal size, **When** content exceeds available width, **Then** text truncates gracefully with ellipsis

---

### User Story 2 - Tab Navigation for Detail Sections (Priority: P1)

As a user viewing run details, I want to switch between sections (Summary, Spec, Live Output, etc.) using tabs so that each section has full vertical space and I can choose what to view.

**Why this priority**: Current J/K scrolling shows limited sections per page, forcing users to scroll repeatedly. Tabs provide direct access and maximize content visibility.

**Independent Test**: Open run detail, press Tab/Shift+Tab or number keys to switch sections, verify each section displays with full available height.

**Acceptance Scenarios**:

1. **Given** user is on run detail screen, **When** they press Tab, **Then** the view switches to the next section tab
2. **Given** user is on run detail screen, **When** they press 1-7, **Then** the view jumps directly to that section
3. **Given** user is viewing a section, **When** they press Shift+Tab, **Then** the view switches to the previous section
4. **Given** user is on run detail, **When** section tabs are displayed, **Then** the active tab is visually highlighted
5. **Given** user is on run detail, **When** all workflow stages are complete, **Then** a "✓ Done" summary indicator appears in the workflow stepper in success color

---

### User Story 3 - Simplified Run Summary (Priority: P2)

As a user viewing the run summary, I want key metrics displayed in a single compact line with visual separators so I can quickly scan the essential information.

**Why this priority**: Current 5-line summary consumes excessive vertical space that could be used for actual content.

**Independent Test**: Open run detail, verify summary shows as one line with pipe or dot separators between metrics.

**Acceptance Scenarios**:

1. **Given** user opens run detail, **When** summary section renders, **Then** all key metrics (status, tokens, elapsed, context) appear on one line separated by visual dividers
2. **Given** a compact summary line, **When** terminal width is insufficient, **Then** metrics wrap gracefully or truncate oldest values first

---

### User Story 4 - Readable Dark Theme Text (Priority: P1)

As a user with a dark terminal theme, I want all text to be clearly readable with white text and colored accents on borders/headers.

**Why this priority**: If text is invisible, the application is unusable. This is a blocking accessibility issue.

**Independent Test**: Set terminal to dark background, open app, verify all text is white/light and borders/headers use accent colors (cyan, blue, green, etc.).

**Acceptance Scenarios**:

1. **Given** a dark terminal background, **When** user views any screen, **Then** body text appears in white
2. **Given** a dark terminal background, **When** user views section headers, **Then** headers appear in a visible accent color (not dark)
3. **Given** a dark terminal background, **When** user views muted/secondary text, **Then** it appears in light gray (#9a9a9a or similar), not dark

---

### User Story 5 - Consistent Tool/Agent Naming (Priority: P2)

As a user viewing run details, I want the tool name (codex, claude, opencode) to be consistent across all views - kanban card, detail header, and live output.

**Why this priority**: Inconsistent naming confuses users about which agent actually ran the feature.

**Independent Test**: Start a run with a specific tool, verify the same tool name appears in kanban card, detail header, and live output.

**Acceptance Scenarios**:

1. **Given** a run was executed by "codex", **When** user views the kanban card, **Then** it shows "codex"
2. **Given** a run was executed by "codex", **When** user views the detail header Tool card, **Then** it shows "codex"
3. **Given** a run was executed by "codex", **When** user views live output, **Then** references to the agent show "codex"

---

### User Story 6 - Clean Heartbeat Display (Priority: P3)

As a user viewing live output, I want heartbeats to show only what the agent is currently doing, hiding diagnostic details like stdout/stderr byte counts and idle time.

**Why this priority**: Diagnostic noise distracts from understanding what the agent is actually working on.

**Independent Test**: While a run is executing, observe live output heartbeats, verify they show only the agent's current activity summary.

**Acceptance Scenarios**:

1. **Given** a running agent sends a heartbeat, **When** live output displays it, **Then** only the agent's current thinking/working message is shown
2. **Given** a heartbeat contains diagnostic data (stdout=474569B stderr=336B idle=5s), **When** displayed, **Then** those details are hidden
3. **Given** a heartbeat fails or agent errors, **When** displayed, **Then** error details are shown (diagnostics hidden only for normal operation)

---

### User Story 7 - Indented Tool Cards (Priority: P3)

As a user viewing the kanban board, I want tool cards to be slightly indented to the right with reduced spacing between them for a cleaner visual hierarchy.

**Why this priority**: Visual polish that improves readability but doesn't block functionality.

**Independent Test**: View kanban board, verify tool info lines are indented under the feature name with minimal vertical gap.

**Acceptance Scenarios**:

1. **Given** kanban cards are displayed, **When** viewing tool/model/effort line, **Then** it is indented 2-4 spaces (marginLeft) from the feature name
2. **Given** multiple kanban cards in a column, **When** displayed, **Then** vertical spacing between cards is 0 lines (marginBottom 0)

---

### Edge Cases

- **Narrow terminal (< 40 columns)**: Force stacked layout; truncate all text with ellipsis; hide non-essential decorative elements
- **Empty sections in tab navigation**: Show empty-state message ("No [section] available") instead of blank space; tab remains accessible
- **Null/empty tool name**: Display fallback text "unknown" in all views (kanban card, detail header, live output)
- **Non-standard heartbeat format**: Render raw heartbeat text as-is when it doesn't match the diagnostic pattern (hide diagnostics only for recognized patterns)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST adapt detail screen layout based on terminal width using three modes: **stacked** (< 80col), **compact** (80–120col), **full** (> 120col)
- **FR-002**: System MUST display detail sections as selectable tabs instead of scrollable pages
- **FR-003**: System MUST show a single "✓ Done" summary indicator (success color) in the workflow stepper when ALL stages are complete, in addition to the existing per-stage ✓ markers
- **FR-004**: System MUST compress run summary to a single line with visual separators
- **FR-005**: System MUST remove the redundant workflow section from the scrollable detail body (already in header stepper); the Workflow tab remains accessible via tab navigation
- **FR-006**: System MUST use white (#ffffff) for primary text in dark theme
- **FR-007**: System MUST use accent colors (not dark colors) for borders and headers in dark theme
- **FR-008**: System MUST use light gray (#9a9a9a) for muted/secondary text in dark theme
- **FR-009**: System MUST display the same tool name consistently across kanban card, detail header, and live output, using `RunSummary.tool` as the canonical source of truth
- **FR-010**: System MUST simplify heartbeat display to show only agent activity summary, hiding diagnostic metrics
- **FR-011**: System MUST indent tool/model/effort line in kanban cards (marginLeft 2-4) with inter-card spacing set to 0 lines (marginBottom 0)
- **FR-012**: System MUST allow direct section access via number keys (1-7) in addition to Tab navigation

### Key Entities

- **RunSummary**: Contains tool, model, status, tokens - source of truth for display consistency
- **ThemeProfile**: Defines color roles (text, muted, primary, etc.) - needs dark theme adjustment
- **DetailSectionId**: Enum of displayable sections (currently 7) — drives tab navigation; number key range (1-7) must match `DETAIL_SECTION_ORDER.length`
- **WorkflowStepper**: Shows pipeline progress - needs "Done" state indicator

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can jump directly to any detail section in 1 keypress (number keys 1-7) vs current sequential navigation requiring N keypresses (J/K scrolling)
- **SC-002**: Run summary consumes 1 line instead of 5 lines, saving 80% vertical space
- **SC-003**: All text is readable on dark terminal backgrounds (0 complaints about invisible text)
- **SC-004**: Tool name is consistent across all views (0 instances of codex/claude mismatch)
- **SC-005**: Heartbeat lines show only agent activity (diagnostic details hidden for normal operation)
- **SC-006**: Detail screen fits within 80-column terminals without horizontal overflow

## Assumptions

- Users primarily use dark terminal themes (most common for developer tools)
- The Ink framework supports tab-based navigation patterns
- Database stores correct tool name in `RunSummary.tool`; display inconsistency is a frontend issue
- Heartbeat diagnostic pattern is predictable and can be reliably filtered
- Number keys 1-7 are available for direct section access (no conflict with existing shortcuts)

## Dependencies

- Existing theme system (src/ui/theme/) provides the foundation for color changes
- Current WorkflowStepper component can be extended with "Done" state
- DetailSectionOrder array already defines all sections for tab generation
