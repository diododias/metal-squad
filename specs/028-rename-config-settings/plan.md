# Implementation Plan: Rename Config to Settings

**Branch**: `feat/set10b-renomear-config-settings` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-rename-config-settings/spec.md`

## Summary

Rename the web dashboard's user-facing configuration-area terminology from
"Config" to "Settings". Keep the existing `#/config` route, `g c` shortcut,
configuration data, and the ordered Runtime, Defaults, Features & Prompts,
Skills, Notifications, and Budget tabs unchanged. Update the navigation label, page heading, and help
overlay language, then cover those user-visible labels with focused web-client
tests.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js >=20.17

**Primary Dependencies**: React 18, React DOM, WebSocket client

**Storage**: N/A for this terminology-only UI change; existing configuration
continues to be read through the current web state.

**Testing**: Vitest 3 with happy-dom and React DOM test rendering

**Target Platform**: `msq web` dashboard in modern desktop and mobile browsers

**Project Type**: Web dashboard within a TypeScript CLI application

**Performance Goals**: No added requests, rendering work, or route transitions;
the existing `#/config` navigation remains a single client-side transition.

**Constraints**: Preserve the current hash route, `g c` shortcut semantics,
settings-tab labels and order, configuration state contracts, and responsive
navigation. Do not change the legacy Ink TUI.

**Scale/Scope**: Three user-visible web-client strings and focused regression
coverage; no data model, database, server, or API contract changes.

## Constitution Check

*Pre-design gate: PASS.*

- **Source of truth**: `specs/028-rename-config-settings/spec.md` records the
  observable terminology change; this plan and its design artifacts remain in
  that feature directory.
- **Layer ownership**: only `src/web/client/` owns the affected labels. No CLI,
  core, database, or server responsibility changes are needed.
- **Validation**: implementation will add or extend focused web-client tests and
  run `npm run build`, `npm test`, `npm run typecheck`, and `npm run lint`.
- **Runtime evidence**: live runner validation is not applicable: this feature
  neither starts nor changes an `msq` execution. A built dashboard plus rendered
  client assertions is the relevant evidence.
- **Harness safety**: this is normal repository work, not validation of the
  `msq` executor; implementation follows `dev-flow` without nested runners.
- **UI scope**: all UI work is in the official web dashboard; the legacy TUI is
  untouched.

*Post-design gate: PASS.* The research and contracts retain the existing route
and data boundary, add no constitutional exception, and require automated
coverage for every changed user-visible surface.

## Project Structure

### Documentation (this feature)

```text
specs/028-rename-config-settings/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── settings-ui.md
```

### Source Code (repository root)

```text
src/web/client/
├── App.tsx                         # sidebar and mobile navigation label
├── HelpOverlay.tsx                 # keyboard-shortcut help label
└── pages/
    └── ConfigPage.tsx              # configuration-area page heading

tests/web/
└── client.test.ts                  # route stability and Settings UI assertions
```

**Structure Decision**: Use the existing web client only. Labels stay with the
components that render them; the `#/config` route and all runtime configuration
data remain owned by their current modules.

## Complexity Tracking

No Constitution Check violations or additional complexity are required.
