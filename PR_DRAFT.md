<!--
PR template canonico para o repo metal-squad.
-->

## Resumo

Reworks the TUI's main dashboard and run detail screen:

- **C1-C3 (main dashboard)**: groups the feature/run list into fixed ordered
  blocks (`EXECUTION/BLOCKED`, `TODO`, `DONE`, `CANCELED`), expands the
  currently selected running item inline into its workflow stage tree, and
  adds a cross-run "In Progress Tasks" feed directly on the dashboard.
- **D1-D5 (run detail screen)**: removes the workflow board duplicated in
  the sidebar (now lives only in the detail screen), shows the full
  spec/feature description instead of just the `feat-xxx` id, separates the
  previously mislabeled Tool/Model metric, adds a declared-task breakdown
  section, and refactors AI log rendering (hidden `AI>`/`TOOL>` prefixes,
  tool output in a bordered/code-block style, cleaner heartbeat lines that
  no longer truncate into garbled text).
- **F1 (core interactions)**: adds a force-bypass (`F`) gate command,
  distinct from approve/skip, that also resumes a paused pipeline in the
  same action.

## Referencias

- Feature: `docs/features/F24-task-stage-progress.md` (status moved to "Em
  progresso"; C2/C3/D1/D4 map directly onto F24's task/stage visibility
  scope — see the doc's "Nota de escopo" and "Progresso desta rodada"
  sections for exactly what shipped vs what's still open).
- F1 (force-bypass gate) is not part of F24; it is a separate core-
  interaction improvement shipped in the same PR because it touches the
  same gates/shortcuts files already being edited for this pass.

## Contexto tecnico

- Area principal: `ui` (dashboard grouping, detail screen, log rendering,
  gates shortcuts), `db` (`listRunningTaskRuns`, `forceResolveGate`),
  `core/adapters` (heartbeat message ASCII fix in `spawn.ts`)
- Motivacao: feature (F24 fold-in) + core interaction (F1) + a small,
  scoped hotfix-style cleanup of the garbled heartbeat message

## Mudancas principais

- [x] UI Ink (dashboard grouping, run detail, sidebar, gates shortcuts,
  command palette entry, hooks)
- [x] DB / config / persistencia (`listRunningTaskRuns`, `forceResolveGate`)
- [x] Adapters / runner / observabilidade (`spawn.ts` heartbeat message)
- [x] Docs / skills / rules (`docs/ROADMAP.md`, F24 feature doc)
- [ ] CLI / comandos (not touched)
- [ ] Backlog / prompt / skills contract (not touched — `catalog.ts` reads
  the existing `spec`/`specFile`/`tasks` fields that already exist in the
  backlog schema; no schema/loader/prompt-builder changes were needed)

## Validacao executada

- [x] `npm run build`
- [x] `npm test` (`npx vitest run`) — 726/727 passing. The 1 failure
  (`tests/db/repo-cleanup.test.ts`) is a pre-existing sandbox limitation
  (`better-sqlite3` native binary mismatch — "invalid ELF header" —
  reproduced independently on a pristine, unmodified `develop` checkout in
  the same sandbox, unrelated to this change; see
  `.claude/rules/harness.md`-adjacent memory notes on sandbox limitations)
- [x] `npm run typecheck`
- [ ] `npm run lint` — pre-existing, documented sandbox issue: ESLint 9 is
  installed but the repo only has a legacy `.eslintrc`, so `eslint src`
  fails immediately with "couldn't find eslint.config.js", independent of
  any change in this PR
- [x] `npx vitest run tests/ui/app.test.ts tests/ui/components.test.tsx
  tests/ui/hooks.test.ts tests/ui/format.test.ts tests/ui/render.test.tsx`
  — 64/64 passing
- [x] `npx vitest run tests/db/index.test.ts tests/db/repo.test.ts
  tests/adapters/codex.test.ts tests/adapters/misc.test.ts` — 35/35 passing
- [ ] Live validation with the default DB — not run in this sandbox; the
  changes are UI-rendering/formatting plus two small, unit-tested DB
  query/command additions. Recommend a quick `msq ui` smoke check locally
  before merge (see Riscos below).

## Evidencias / comandos

```bash
npm run typecheck   # tsc --noEmit — clean
npm run build       # tsc && chmod +x dist/index.js — clean
npx vitest run      # 726 passed, 1 failed (pre-existing sandbox-only ELF header issue)
npx vitest run tests/ui/app.test.ts tests/ui/components.test.tsx tests/ui/hooks.test.ts tests/ui/format.test.ts tests/ui/render.test.tsx
  # 64 passed
npx vitest run tests/db/index.test.ts tests/db/repo.test.ts tests/adapters/codex.test.ts tests/adapters/misc.test.ts
  # 35 passed
```

## Riscos e follow-ups

- The status-bar hint list for the gates context is capped at 6 entries;
  adding the new `F:force` hint pushed `?:help` out of that specific list
  (help is still reachable globally via `?` — this is a cosmetic tradeoff,
  covered by an updated test assertion in `tests/ui/app.test.ts`).
- F1's "force" semantics differ by gate kind: for budget/on-fail `gate`
  rows it both approves and resumes a paused pipeline; for staged
  `stage_requests` approvals it behaves like a normal advance, since those
  already unblock the running pipeline as soon as they resolve (no extra
  "stuck" state to force past). This is intentional and documented inline
  in `src/db/repo.ts` / `src/ui/hooks/useGates.ts`.
- F24 is not fully closed by this PR: the horizontal ASCII "stage pipeline"
  diagram from the original F24 mockup was not built (a vertical indented
  stage list was used instead, which fits the terminal layout better), and
  per-adapter output-based stage detection (parsing Claude skill calls /
  Codex-OpenCode heuristics) was not implemented — the existing
  `task_runs`/backlog-status fallback is what both the dashboard and detail
  screen consume today. See `docs/features/F24-task-stage-progress.md` for
  the itemized checklist.
- Not live-tested against a real running pipeline in this sandbox (no
  writable global DB / real adapter execution available here). The new DB
  queries (`listRunningTaskRuns`, `forceResolveGate`) are exercised only
  indirectly via UI hook mocks and existing `db/repo` test patterns, not
  against a live SQLite file with real `task_runs`/`gates`/`pipelines`
  rows. Recommend running `msq ui` locally against the default DB once
  before merging, especially to eyeball the new dashboard grouping and the
  force-approve flow against a real paused pipeline.
- Two stray local files (`.git-commit-msg-1.txt`, `.git-commit-msg-2.txt`)
  are left untracked at the worktree root — they were used to pass
  multi-line commit messages to `git commit-tree` in this sandbox (which
  cannot delete files it doesn't own) and are safe to delete locally; they
  are not part of any commit.
