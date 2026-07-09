# F11 — Fix TUI flicker on iTerm2

## Problem

Running `msq ui` in iTerm2 causes visible screen flicker. The flicker is most
noticeable when a run is selected and its output is being streamed, but also
appears during idle polling of runs, gates, and stats.

## Root causes

1. **Manual alternate screen management** in `src/commands/ui.ts` sends
   `ESC [?1049h/l` around Ink's `render()`. Ink already owns stdout/cursor
   rendering, so the duplicate alternate-screen transitions cause flashes on
   startup, resize, and exit.
2. **Aggressive output polling**: `useRunOutput` refreshes every 350 ms and
   always calls `setOutput` with a new array reference, forcing a full re-render
   of `MainPanel` multiple times per second.
3. **Fixed-height root layout**: `App.tsx` pins the root `Box` to
   `process.stdout.rows`, so every state update reconciles the whole canvas
   instead of only changed regions.
4. **Unmemoized heavy components**: `MainPanel`, `StatsBar`, and `KanbanCard`
   re-render on every polling tick even when their data is unchanged.
5. **Uncoordinated polling timers**: multiple hooks fire independently every
   2–5 seconds, producing a stream of partial screen updates.

## Solution

- Remove manual alternate-screen escape sequences; let Ink manage the terminal.
- Enforce a 750 ms minimum polling interval in `useRunOutput` and make it
  adaptive: when output stops changing, back off to a slower interval; when it
  changes again, return to the minimum.
- Avoid `setOutput` when the output content has not actually changed.
- Remove the fixed `height` from the root `Box` in `App.tsx`.
- Memoize `MainPanel`, `StatsBar`, and `KanbanCard` with `React.memo`.

## Acceptance criteria

- `msq ui` starts and exits without flashing in iTerm2.
- Output still updates in real time (no slower than ~1 second while active).
- No visible flicker during 30+ seconds of normal use.
- Existing keyboard navigation, dashboard, gates, and run detail continue to
  work.
