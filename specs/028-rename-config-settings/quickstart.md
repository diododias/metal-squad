# Quickstart Validation: Rename Config to Settings

## Prerequisites

- Node.js `>=20.17` and installed repository dependencies.
- A buildable checkout of `metal-squad`.

## Focused validation

1. Run the focused web-client test that covers the Settings labels and the stable
   `#/config` route:

   ```bash
   npm exec vitest run tests/web/client.test.ts
   ```

2. Run the required code-change gates:

   ```bash
   npm run build
   npm test
   npm run typecheck
   npm run lint
   ```

## Manual dashboard check

1. Start the web dashboard with the normal local command.
2. In the sidebar or mobile navigation, select **Settings**.
3. Confirm the destination heading is **Settings** and the URL remains
   `#/config`.
4. Confirm the category order is Runtime, Defaults, Skills, Notifications, Budget;
   select each category and verify its existing content appears.
5. Open keyboard help and confirm `g c` says **Go to Settings**; use it and
   confirm the same destination opens.

See [the UI contract](./contracts/settings-ui.md) for the exact observable
requirements and [the data model](./data-model.md) for preservation boundaries.
