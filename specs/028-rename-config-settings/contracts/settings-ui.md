# Settings UI Contract

## Stable navigation contract

| Consumer interaction | Required observable result |
|---|---|
| View desktop sidebar or mobile tab navigation | The configuration destination is labelled `Settings`. |
| Select Settings | The existing `#/config` destination opens successfully. |
| Press `g c` and consult keyboard help | The shortcut still targets `#/config` and is described as `Go to Settings`. |

## Stable page contract

| Surface | Required observable result |
|---|---|
| Destination heading | Displays `Settings`. |
| Category tabs | Displays Runtime, Defaults, Skills, Notifications, Budget in this order. |
| Category interaction | Each existing category remains selectable and renders its existing content. |

## Compatibility boundary

The hash path, page component identity, runtime configuration schema, WebSocket
messages, and persisted configuration remain unchanged. `Config` may remain in
internal identifiers where it is not rendered to the product user.
