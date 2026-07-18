# H26 - Runs Misclassified as Blocked When the Agent Skips MSQ_DONE

## Problem

A `claude` run could complete the requested work correctly (implementation, gates green, branch rebased) and still be persisted as `blocked` with the generic summary `agent finished without declaring MSQ_DONE`, even though nothing about the underlying work had failed. Observed on `F-4YW66H3T` / run 302: the agent verified all gates, then ended its final response with a plain-language question ("Want me to push and open the PR now?") instead of one of the msq control signals.

## Root Cause

Claude Code's own default safety habit — pause and confirm before actions visible to others, such as `git push` or opening a PR — runs even inside a headless `msq`-orchestrated session where `--dangerously-skip-permissions` already bypasses the interactive tool-approval UI. That flag only removes the approval prompt; it does not touch the model's own reflex to ask a clarifying question in prose. Because the `implement` stage prompt never said push/PR were already authorized, and because a plain-language question isn't one of the three parseable control signals (`MSQ_DONE`, `MSQ_INPUT_REQUIRED`, `MSQ_BLOCKED`), `executeStageRun` in `src/core/runner/execute.ts` had no signal to act on and fell into the generic "ok but undeclared" branch, which unconditionally marked the run `blocked`. Codex/OpenCode were not observed to exhibit the same reflex as strongly.

## Resolution

- `buildStagePrompt`'s `implement`-stage "Implementation exit contract" (`src/core/runner/execute.ts`) now states explicitly that pushing the branch and opening the PR are pre-authorized for the session, and that ending the final response with a plain-language question instead of a control signal is a protocol violation.
- `executeStageRun` gets one reinforcement turn as a safety net: when a run exits `ok` without declaring a control signal and a resumable session handle is available, it resends the same session a short follow-up (`PROTOCOL_REINFORCEMENT_PROMPT` in `src/core/runner/communicationProtocol.ts`) asking the agent to either declare `MSQ_DONE` now (no further confirmation needed) or use `MSQ_INPUT_REQUIRED` / `MSQ_BLOCKED` if genuinely stuck. The retry is capped at exactly one attempt and reuses the existing publish-gate/base-reconciliation classification, so a successful reinforcement is treated identically to a first-turn `MSQ_DONE`. This is adapter-agnostic — it dispatches through the same `ToolAdapter.runFeature` contract regardless of which tool produced the original session.
- If the reinforcement turn still doesn't produce a control signal, the run is finalized as `blocked` as before, with the summary suffixed `(protocol reinforcement attempted)` for observability.

## Verification

- `tests/runner/execute.test.ts`: new case confirms a run recovers to `done` when the reinforced turn declares `MSQ_DONE` with valid publication fields, and asserts the adapter is resumed with the captured session handle.
- `tests/runner/execute.test.ts`: new case confirms a run that still doesn't declare a signal after reinforcement is finalized as `blocked` with the `(protocol reinforcement attempted)` summary, and that the adapter is called exactly twice (no retry loop).
- `rtk npm run build`, `rtk npm test` (1296/1296), `rtk npm run typecheck`, `rtk npm run lint` all pass.
