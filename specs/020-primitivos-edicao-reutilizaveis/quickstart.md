# Quickstart: Validate reusable editing primitives

## Prerequisites

- Node.js `>=20.17`
- Dependencies installed with the repository package manager
- Work from the repository root

## Automated validation

Run the focused component suite after implementation:

```bash
rtk npx vitest run tests/web/editable-controls.test.tsx
```

The suite must prove the contract in
[editable-controls.md](./contracts/editable-controls.md):

1. each control associates a visible label with its native field and delivers a
   proposed value to the parent callback;
2. the modified marker appears when `value` differs from `initialValue` and
   disappears after restoration;
3. disabled text, select, and toggle controls reject user changes while keeping
   label/value/dirty state visible;
4. empty, undefined, no-options, and unavailable-selected-option cases render a
   stable explanatory state.

Then run the repository gates required for TypeScript web-client changes:

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

## Local visual smoke check

Start the dashboard without invoking the executor:

```bash
rtk npm run build
MSQ_WEB_PASSWORD=local rtk node dist/index.js web --host 127.0.0.1
```

Open the printed local URL and use the component demonstration or first adopting
card to confirm the shared panel/sunken-input treatment matches the step-guidance
editing reference. Change then restore each control, repeat with disabled mode,
and repeat with no value/no available option. No SQLite state or feature patch
should be written merely by interacting with a primitive.
