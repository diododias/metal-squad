# Data Model: Rename Config to Settings

This feature introduces no persisted entities or schema changes. It preserves
the existing client-side presentation model.

## Entity: Settings area presentation

| Field | Source | Rule |
|---|---|---|
| navigation label | `App.tsx` nav item | Must render `Settings`. |
| route | existing route parser and navigation | Must remain `#/config`. |
| heading | `ConfigPage.tsx` page header | Must render `Settings`. |
| shortcut help | `HelpOverlay.tsx` | Must describe `g c` as going to Settings. |

## Entity: Settings category

| Field | Value / source | Validation rule |
|---|---|---|
| identifiers | `runtime`, `defaults`, `features`, `skills`, `notifications`, `budget` | Remain unchanged. |
| visible labels | Runtime, Defaults, Features & Prompts, Skills, Notifications, Budget | Set, spelling, and order remain unchanged. |
| selection state | local `tab` state in `ConfigPage` | Selecting a category continues to render its existing contents. |

## Relationships and state transitions

- The Settings-area navigation item selects the existing `#/config` route.
- The route continues to render the existing page component and its selected
  category state.
- This feature has no persistence transition, WebSocket message, database write,
  or configuration-resolution change.
