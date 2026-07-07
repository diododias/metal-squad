# Feature Specification: Command Palette & Keyboard Shortcuts

**Feature Branch**: `003-command-palette`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Feature: F09 — Command Palette & Shortcuts

Existing feature brief from docs/features/F09-command-palette.md:
# F09 — Command Palette & Shortcuts

**Epic**: [E02 — Modern TUI](../epics/E02-modern-tui.md)
**Prioridade**: Media
**Esforco**: Medium
**Depende de**: F05

## Problema

A TUI tem poucos atalhos fixos (q, a, s, r, setas). Falta um command palette para acoes rapidas e discoverability de funcionalidades.

## Solucao

### Command palette (Ctrl+P ou `:`)

Popup com fuzzy search sobre acoes disponiveis:
- `run <feature>` — inicia execucao
- `pause` / `resume` / `abort` — controles de run
- `filter <status>` — filtra lista
- `gate approve/skip/retry` — resolve gate
- `stats` — mostra analytics
- `config` — abre configuracao
- `help` — ajuda

### Shortcuts globais

| Key | Acao |
|-----|------|
| `q` | Quit |
| `Tab` | Alterna foco |
| `j/k` | Navega |
| `Enter` | Seleciona/drill |
| `Esc` | Volta |
| `Ctrl+P` / `:` | Command palette |
| `Ctrl+L` | Toggle log view |
| `?` | Help overlay |
| `1-5` | Switch para tab N |

### Contextuais (mudam por painel)

| Contexto | Key | Acao |
|----------|-----|------|
| Gates | `a` | Approve |
| Gates | `s` | Skip |
| Gates | `r` | Retry |
| Run detail | `p` | Pause |
| Run detail | `x` | Abort |

## Criterios de aceite

- [ ] Command palette com fuzzy search
- [ ] Shortcuts globais e contextuais funcionais
- [ ] Help overlay com `?`
- [ ] Atalhos exibidos no status bar"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quick Command Access via Palette (Priority: P1)

Users monitoring msq runs need to quickly access commands without memorizing all keyboard shortcuts or navigating through multiple screens.

**Why this priority**: Command palette is the core feature — it provides the fastest way to discover and execute any action, making the TUI immediately more productive. Without it, users must remember shortcuts or navigate menus, which slows down workflow.

**Independent Test**: Can be fully tested by opening the command palette (Ctrl+P or `:`) and executing any available action through fuzzy search. Delivers immediate value by allowing command discovery and execution.

**Acceptance Scenarios**:

1. **Given** TUI is running with multiple features, **When** user presses `Ctrl+P` or `:`, **Then** command palette opens with fuzzy search input focused
2. **Given** command palette is open, **When** user types "run", **Then** all run-related commands appear filtered (run <feature>, resume, abort)
3. **Given** command palette shows filtered results, **When** user selects a command with Enter, **Then** command executes and palette closes
4. **Given** command palette is open, **When** user presses Esc, **Then** palette closes without executing any command
5. **Given** command palette is open, **When** user types "pau" (fuzzy match), **Then** "pause" command appears in filtered results
6. **Given** no features are running, **When** user opens command palette, **Then** only applicable commands appear (run, stats, config, help — pause/resume/abort hidden)

---

### User Story 2 - Context-Aware Keyboard Shortcuts (Priority: P2)

Users working with gates or runs need quick keyboard shortcuts for common actions specific to their current context.

**Why this priority**: Context-aware shortcuts reduce repetitive clicking and speed up common operations like gate approval or run control. This is secondary to command palette because shortcuts require memorization, while palette provides discovery.

**Independent Test**: Can be tested by navigating to gates panel and pressing `a`, `s`, or `r` keys, or navigating to run detail and pressing `p` or `x`. Delivers value by enabling rapid gate/run management without mouse.

**Acceptance Scenarios**:

1. **Given** user is viewing gates panel with pending gate, **When** user presses `a`, **Then** gate is approved immediately
2. **Given** user is viewing gates panel with pending gate, **When** user presses `s`, **Then** gate is skipped immediately
3. **Given** user is viewing gates panel with pending gate, **When** user presses `r`, **Then** gate is retried immediately
4. **Given** user is viewing run detail for active run, **When** user presses `p`, **Then** run is paused
5. **Given** user is viewing run detail for active run, **When** user presses `x`, **Then** abort confirmation appears
6. **Given** user is in main list view (not gates or run detail), **When** user presses `a`, `s`, `r`, `p`, or `x`, **Then** nothing happens (shortcuts are context-specific)

---

### User Story 3 - Global Navigation Shortcuts (Priority: P2)

Users navigating the TUI need consistent keyboard shortcuts that work across all screens.

**Why this priority**: Global shortcuts provide essential navigation and quick access to common views. Tied with P2 because both context-aware and global shortcuts improve efficiency, but neither is as critical as command palette for discoverability.

**Independent Test**: Can be tested by using shortcuts from any screen (q, Tab, j/k, Enter, Esc, Ctrl+L, ?, 1-5) and verifying consistent behavior. Delivers value by enabling keyboard-only navigation.

**Acceptance Scenarios**:

1. **Given** TUI is running, **When** user presses `q`, **Then** TUI quits
2. **Given** TUI has multiple focusable panels, **When** user presses `Tab`, **Then** focus cycles to next panel
3. **Given** user is viewing a list, **When** user presses `j` or `k`, **Then** selection moves down or up respectively
4. **Given** user has selected an item, **When** user presses `Enter`, **Then** detail view for that item opens
5. **Given** user is in detail view, **When** user presses `Esc`, **Then** user returns to previous list view
6. **Given** TUI is running, **When** user presses `Ctrl+L`, **Then** log view toggles visibility
7. **Given** TUI is running, **When** user presses `?`, **Then** help overlay appears showing all available shortcuts
8. **Given** TUI has tab navigation, **When** user presses `1`, `2`, `3`, `4`, or `5`, **Then** corresponding tab becomes active

---

### User Story 4 - Shortcut Discovery via Help Overlay (Priority: P3)

Users unfamiliar with available shortcuts need a quick reference to see what keyboard commands are available.

**Why this priority**: Help overlay aids discoverability but is less critical than command palette (which also provides discovery) and actual shortcuts. It's a nice-to-have reference feature.

**Independent Test**: Can be tested by pressing `?` from any screen and verifying all shortcuts are displayed correctly with context-aware shortcuts highlighted. Delivers value by reducing learning curve.

**Acceptance Scenarios**:

1. **Given** TUI is running, **When** user presses `?`, **Then** help overlay appears showing all global shortcuts
2. **Given** help overlay is visible, **When** user presses `?` or `Esc`, **Then** help overlay closes
3. **Given** user is viewing gates panel, **When** user opens help overlay, **Then** context-specific shortcuts (a, s, r) are highlighted or marked as available
4. **Given** user is viewing run detail, **When** user opens help overlay, **Then** context-specific shortcuts (p, x) are highlighted or marked as available
5. **Given** help overlay is open, **When** user is in main list view, **Then** only global shortcuts are shown as available

---

### User Story 5 - Status Bar Shortcut Hints (Priority: P3)

Users need contextual reminders of available shortcuts without opening help overlay.

**Why this priority**: Status bar hints are convenience features that reduce cognitive load, but users can always access help overlay or command palette. Lowest priority because it's supplementary to other discovery mechanisms.

**Independent Test**: Can be tested by navigating to different screens and verifying status bar updates with relevant shortcut hints. Delivers value by providing just-in-time shortcut reminders.

**Acceptance Scenarios**:

1. **Given** user is viewing gates panel, **When** gates panel is focused, **Then** status bar shows "a:approve s:skip r:retry ?:help"
2. **Given** user is viewing run detail, **When** run detail is focused, **Then** status bar shows "p:pause x:abort ?:help"
3. **Given** user is viewing main list, **When** main list is focused, **Then** status bar shows "j/k:navigate Enter:select Tab:focus ?:help"
4. **Given** status bar is visible, **When** user presses displayed shortcut, **Then** corresponding action executes

---

### Edge Cases

- What happens when user types invalid command in palette? → No matches shown, or "No commands found" message displayed
- What happens when user presses context-specific shortcut in wrong context? → Nothing (shortcuts are context-aware and only active in relevant screens)
- What happens when user presses shortcut while command palette is open? → Shortcut is ignored (palette captures input for search)
- What happens when user opens command palette while another modal (help overlay) is open? → Previous modal closes, command palette takes focus
- What happens when user tries to execute a command that's not currently available (e.g., pause when nothing is running)? → Command either doesn't appear in palette, or shows disabled state with explanation
- What happens when fuzzy search has multiple close matches? → All matches shown in ranked order, user can navigate with arrows and select with Enter
- What happens when user tabs to a panel that has no context shortcuts? → Status bar shows only global shortcuts

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a command palette triggered by `Ctrl+P` or `:`
- **FR-002**: Command palette MUST support fuzzy search filtering over all available commands
- **FR-003**: Command palette MUST show commands organized by category (run control, filtering, gates, system)
- **FR-004**: System MUST support the following global keyboard shortcuts: `q` (quit), `Tab` (cycle focus), `j/k` (navigate), `Enter` (select), `Esc` (back), `Ctrl+L` (toggle logs), `?` (help), `1-5` (tab switch)
- **FR-005**: System MUST support context-aware shortcuts that only work in specific panels: gates panel (`a`, `s`, `r`), run detail panel (`p`, `x`)
- **FR-006**: System MUST provide a help overlay (triggered by `?`) that lists all available shortcuts
- **FR-007**: Help overlay MUST distinguish between global shortcuts and context-specific shortcuts
- **FR-008**: System MUST display relevant shortcut hints in the status bar based on current focus/context
- **FR-009**: Command palette MUST hide commands that are not applicable in current state (e.g., hide pause/resume/abort when no runs are active)
- **FR-010**: System MUST close command palette when user presses `Esc` or executes a command
- **FR-011**: System MUST execute selected command when user presses `Enter` in command palette
- **FR-012**: Keyboard shortcuts MUST take precedence over text input unless command palette or another input field is focused

### Key Entities

- **Command**: An executable action available in the TUI (run, pause, resume, abort, approve gate, skip gate, etc.)
  - Attributes: name, description, category, keyboard shortcut (if any), availability condition
- **Keyboard Shortcut**: A key or key combination mapped to a command
  - Attributes: key/combination, scope (global or context-specific), target command
- **Context**: The current focused panel or view (main list, gates panel, run detail, etc.)
  - Determines which context-specific shortcuts are active

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can discover and execute any available command within 3 seconds using command palette
- **SC-002**: Users can approve/skip/retry gates within 1 second using keyboard shortcuts (compared to 3+ seconds with mouse navigation)
- **SC-003**: Users can toggle log view, switch tabs, and navigate lists without using mouse
- **SC-004**: Help overlay provides complete reference of all shortcuts, reducing "how do I..." support questions by 60%
- **SC-005**: 90% of users successfully execute at least one command via command palette within first session
- **SC-006**: Keyboard shortcuts work correctly in all contexts without conflicts or unexpected behavior

## Assumptions

- Users are familiar with common keyboard-driven interfaces (command palette pattern from VSCode/Sublime, vim-style j/k navigation)
- Terminal/console environment supports the specified key combinations (Ctrl+P, Ctrl+L, etc.)
- Existing TUI framework (Ink) supports modal overlays and key event handling
- Status bar is already implemented and can be updated dynamically based on focus
- Multi-panel layout exists (depends on F05 according to feature brief)
- Command execution uses existing action handlers — this feature only adds keyboard access layer
- Fuzzy search library/algorithm is available or will be chosen during implementation
