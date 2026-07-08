# Research: Theme System

**Feature**: 004-theme-system
**Date**: 2026-07-07
**Status**: Complete

## Overview

This document records the research decisions for replacing hardcoded TUI colors with a centralized, config-driven theme system in `metal-squad`.

## Research Task 1: Model theme roles for Ink primitives

**Question**: How should the TUI represent theme values so they cover `Text`, `Box`, border, dim, and emphasis behavior without reintroducing hardcoded strings?

### Decision: Use semantic theme profiles backed by Ink-compatible style tokens

**Rationale**:
- The current TUI already depends on Ink props such as `color`, `borderColor`, `dimColor`, `backgroundColor`, and `inverse`.
- The existing hardcoded values are spread across `src/ui/format.ts` and many components, so a semantic layer is needed to stop each component from choosing colors directly.
- Semantic roles such as `primary`, `success`, `warning`, `error`, `muted`, `accent`, `focus`, and `surface` let components ask for intent instead of palette details.

**Alternatives considered**:
- Keep a shared string map like `{ success: "green" }` and let components assemble their own styles. Rejected because it still leaks rendering choices into each component.
- Introduce a CSS-like abstraction unrelated to Ink props. Rejected because the TUI renders with Ink, not a browser DOM.

## Research Task 2: Persist theme selection and handle invalid values

**Question**: Where should the selected theme live, and how do we satisfy fallback behavior for invalid theme names?

### Decision: Store `theme` in the existing config file as input, then resolve it through a dedicated fallback helper

**Rationale**:
- `src/config/index.ts` already owns persistent user preferences at `~/.config/metal-squad/config.json`.
- FR-008 requires invalid theme names to fall back to `default` with user feedback, not crash config loading.
- A strict `z.enum([...])` schema would make an unknown theme reject the entire config file, which conflicts with the spec.

**Alternatives considered**:
- Validate `theme` as a strict enum inside `ConfigSchema`. Rejected because it turns a bad theme name into a fatal config error.
- Create a separate theme file outside `config.json`. Rejected because the feature spec assumes existing configuration patterns and persistent settings.

## Research Task 3: Distribute the active theme across the TUI

**Question**: How should components consume the active theme without prop-drilling style values through the whole app?

### Decision: Add a `ThemeProvider` and `useTheme()` hook under `src/ui/theme/`

**Rationale**:
- `App.tsx` is the natural startup boundary where config is loaded and fallback messages can be emitted.
- A React context allows deeply nested UI components to consume semantic theme roles directly.
- Theme-specific status/event helper maps can be computed once per render tree and reused by `format.ts`, `StatusBar`, `NotificationsFeed`, `RunTable`, `MainPanel`, and `Sidebar`.

**Alternatives considered**:
- Pass theme props through every component layer. Rejected because it creates noisy signatures and spreads theme plumbing across unrelated logic.
- Import a global singleton theme module directly in every component. Rejected because it couples rendering to mutable global state and makes tests harder.

## Research Task 4: Define the minimal theme for constrained terminals

**Question**: What should the built-in `minimal` theme do so it stays readable on limited-color terminals while still distinguishing critical states?

### Decision: Use a reduced palette plus emphasis flags (`bold`, `dimColor`, `inverse`) instead of full chromatic variation

**Rationale**:
- FR-009 requires essential status distinctions even when broad color usage is undesirable or unavailable.
- A limited palette still needs different semantic outcomes for running, success, warning, failure, and accent states.
- Using emphasis flags keeps the theme useful even when terminals downgrade or normalize colors.

**Alternatives considered**:
- Make `minimal` fully monochrome. Rejected because it weakens status differentiation too far for failures and warnings.
- Reuse the default palette with lighter saturation only. Rejected because it does not actually reduce reliance on broad color use.

## Research Task 5: Validate the theme system end-to-end

**Question**: What is the smallest validation set that proves theme selection, fallback behavior, and semantic consistency?

### Decision: Combine config resolution tests, representative Ink render tests, and manual startup scenarios

**Rationale**:
- Config tests can verify defaulting, persistence, and fallback resolution quickly.
- Representative render tests cover the highest-risk semantic areas: status colors, borders/focus states, notifications, and muted/help text.
- Manual scenarios are still needed to verify the four built-in themes remain understandable in a real terminal.

**Alternatives considered**:
- Manual-only validation. Rejected because regressions in semantic mapping are too easy to miss.
- Snapshot the full TUI in every state. Rejected because it is high-maintenance and noisy relative to the feature scope.
