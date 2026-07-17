# Implementation Plan: GitHub Actions CI

**Branch**: `030-github-actions-ci` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/030-github-actions-ci/spec.md`

## Summary

Add a single GitHub Actions quality workflow for pull requests to and pushes on
`develop`, with manual rerun support. It will invoke the repository's existing
full quality gate, after making that gate runnable in a clean GitHub-hosted
environment without the locally installed RTK executable. The workflow will be
least-privilege, cancel obsolete runs, use lockfile-backed dependency caching,
and be paired with documented `develop` branch protection.

## Technical Context

**Language/Version**: TypeScript on Node.js `>=20.17.0`; CI target Node 22
**Primary Dependencies**: npm, GitHub Actions, existing Node build/test tooling
**Storage**: Disposable SQLite database created through `scripts/with-sandbox-db.mjs`
**Testing**: Vitest, ESLint, TypeScript compiler, coverage gate, repository validators
**Target Platform**: GitHub-hosted Ubuntu runner and developer machines
**Project Type**: TypeScript CLI with web dashboard
**Performance Goals**: Complete validation within the configured 20-minute job timeout
**Constraints**: No secrets; `contents: read` only; no access to the global catalog; the YAML must not duplicate gate commands
**Scale/Scope**: One workflow and one quality job, plus gate portability and documentation; no release, deployment, artifact publication, or mutation testing

## Constitution Check

*Pre-design: PASS. Re-checked after design: PASS.*

- **Source of truth**: `specs/030-github-actions-ci/` records behavior; `scripts/gate.mjs` remains the single executable quality contract; README records the operator-facing contract.
- **Layer ownership**: GitHub workflow owns triggering and runner setup; `scripts/gate.mjs` owns ordered quality validation; `with-sandbox-db.mjs` owns disposable persistence. No application/UI ownership changes.
- **Validation**: Changes to the gate have focused tests for the portable launcher and the full gate is run locally and by the workflow. The workflow itself receives syntax and behavioral validation through a test pull request.
- **Runtime evidence**: A CI run produces an immutable GitHub check and per-step logs; it does not run the `msq` executor, so no live-run requirement applies.
- **Harness safety**: This is normal repository tooling, not executor QA; no nested `msq run` is added.
- **UI scope**: No UI work.
- **Violations**: None.

## Project Structure

```text
.github/
└── workflows/
    └── ci.yml                         # CI triggers, permissions, setup, and quality job
scripts/
├── gate.mjs                           # portable ordered quality gate
└── gate-lib.mjs                       # gate helper tests / portability support if needed
tests/
└── scripts/                           # focused tests for gate behavior, if absent create it
README.md                              # CI behavior and local equivalent
specs/030-github-actions-ci/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── ci-workflow.md
```

**Structure Decision**: Keep the quality policy in the existing script layer and add only the GitHub integration file. The workflow orchestrates but does not own individual checks.

## Phase 0: Research Complete

Research decisions and official sources are in [research.md](./research.md). No unresolved clarification remains.

## Phase 1: Design

1. Add the workflow contract defined in `contracts/ci-workflow.md`.
2. Make the gate launcher choose an executable command that is guaranteed in CI, retaining RTK only when safely detected locally; preserve exit-code and warning behavior.
3. Add `.github/workflows/ci.yml` with stable `qualidade-completa` job identity, the three required triggers, read-only permissions, Node 22, npm cache, 20-minute timeout, concurrency, and `npm run gate:full`.
4. Add or extend focused script tests proving the gate does not require RTK; avoid testing GitHub internals in application tests.
5. Update README with triggers, local equivalent, and the post-merge branch-protection procedure.

## Phase 2: Validation and Rollout

1. Run focused gate tests, then `npm run gate:full` locally from a clean dependency state.
2. Open a pull request and confirm the expected job name, logs, and status on a passing revision.
3. Push a deliberately invalid, non-merged test revision to confirm the check fails in each representative category; remove it before merge.
4. Update the same pull request twice and confirm the older execution is cancelled.
5. After one successful run, configure the `develop` ruleset to require `CI / qualidade-completa` and require branches to be up to date before merge.

## Complexity Tracking

No constitution violations or complexity exceptions.
