# TUI Session and Run Navigation Contract

## Scope

This contract defines the operator-visible behavior for navigating historical
session and run data inside `msq ui`.

## Navigation Levels

### Overview

- Lists registered repos that have recorded run history.
- Each row exposes enough summary context to choose the next drill-down target:
  repo id, recent status mix, latest activity, and available tools.
- `enter` opens the selected repo.

### Repo

- Lists features for the selected repo that have recorded runs.
- Each row shows feature id, optional title, latest result, run count, and most
  recent activity.
- Search at this level matches feature id and feature title only.
- `enter` opens the selected feature history.

### Feature

- Lists historical runs for one feature within one repo.
- Rows distinguish runs by run id, status, tool, timestamps, duration, and token
  totals.
- `enter` opens run detail.
- `space` toggles the highlighted run in the comparison selection set.
- `c` opens compare when exactly two runs from the same feature are selected.

### Run

- Shows the full log in chronological order plus run metadata: result, tool,
  duration, token usage, relevant timestamps, stage information, and any
  available pipeline/task context.
- If a field is unavailable, the UI renders an explicit placeholder such as
  `Not available yet`.

### Compare

- Shows two runs from the same feature side-by-side.
- Highlights differences for result, duration, and token usage.
- Prevents opening if the selection is not exactly two runs from the same
  feature and shows an explanatory message instead.

## Keyboard Contract

- `j` / `k`: move selection within the active list
- `enter`: drill down or open the selected row
- `esc`: close modal state first; otherwise return to the previous navigation level
- `tab`: move focus across visible panels without losing the active navigation level
- `f`: open or toggle status filtering for the current list level
- `t`: open or toggle tool filtering for the current list level
- `/`: enter search mode for the current list level
- `space`: toggle current run in compare selection when on the Feature level
- `c`: open compare for the current feature selection
- `backspace` or clear action: remove the latest search character or clear the active query

## Filtering and Search Rules

- Status filtering supports at least `running`, `done`, `failed`, and `blocked`.
- Tool filtering supports the tools present in the current scope.
- Active filter and search state must remain visible while applied.
- Clearing filters or search does not change the current level or selected context.
- Zero matches produce an empty state that explains whether filters or search
  caused the empty result.

## Selection Preservation

- When the operator returns with `esc`, the previous level restores its last
  selected row and filter/search state when that item still exists.
- If the remembered row no longer exists, selection clamps to the nearest valid row.

## Empty and Error States

- No repos with history: explain that no navigable history exists yet.
- Repo with no matching features: explain whether the repo has no history or the
  active filters removed all matches.
- Feature with fewer than two runs: show that comparison is unavailable until a
  second run exists.
- Invalid compare request: explain that only runs from the same feature can be compared.
- Missing log or partial run data: show available data and mark unavailable
  fields explicitly instead of hiding the section.
