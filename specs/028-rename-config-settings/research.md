# Research: Rename Config to Settings

## Decision: retain the `#/config` route and rename only visible terminology

**Rationale**:

- `src/web/client/App.tsx` maps both the `#/config` hash route and the `g c`
  keyboard shortcut to the existing `ConfigPage`.
- The feature explicitly excludes continued support for separately shared direct
  links, while preserving the current internal navigation is the lowest-risk
  terminology-only change.
- Changing a display label has no need to change the route, page component name,
  or configuration data contracts.

**Alternatives considered**:

- Rename the route to `#/settings`: rejected because it adds a navigation
  compatibility change outside the requested scope.
- Rename internal component and configuration identifiers: rejected because
  those are implementation terms, not user-facing labels, and would create
  unrelated churn.

## Decision: update every visible entry point to the same Settings name

**Rationale**:

- The current display surfaces are the sidebar/mobile navigation item in
  `App.tsx`, the `ConfigPage` header, and the keyboard-help text in
  `HelpOverlay.tsx`.
- Updating these together fulfills the consistent-name requirement without
  touching runtime configuration field names such as `runtimeConfig`.

**Alternatives considered**:

- Change only the navigation: rejected because the destination heading would
  remain inconsistent.
- Change every technical `Config` identifier: rejected because it would risk
  configuration behavior and exceeds the terminology-only scope.

## Decision: preserve the existing settings-category list verbatim

**Rationale**:

- `ConfigPage.tsx` defines the ordered categories as Runtime, Defaults, Features
  & Prompts, Skills, Notifications, and Budget.
- The rename has no state, request, storage, or server behavior change, so the
  existing tab array and selected-tab state are the preservation boundary.

**Alternatives considered**:

- Rename or reorganize categories while touching the page: rejected by FR-005.
- Add a new Settings data model: rejected because the existing page state is
  sufficient and no domain data changes.

## Decision: test rendered user-visible labels and route stability

**Rationale**:

- Existing `tests/web/client.test.ts` already validates parsing `#/config`.
- Focused rendering assertions can prove the navigation, page header, help text,
  and unmodified category order without introducing a browser end-to-end stack.

**Alternatives considered**:

- Rely on type checking alone: rejected because it cannot detect stale visible
  "Config" labels.
- Run a live `msq` pipeline: rejected because no runner behavior is changed.
