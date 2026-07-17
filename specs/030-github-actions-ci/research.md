# Research: GitHub Actions CI

## Decision: Reuse the complete quality gate as the only validation command

- **Decision**: The workflow runs `npm run gate:full` as its single project validation step.
- **Rationale**: The existing command already builds, migrates a disposable database, typechecks, lints, tests, enforces coverage, validates repository references, and smoke-tests the CLI. A separate workflow sequence would duplicate and eventually drift from local validation.
- **Alternatives considered**:
  - List each quality command in the workflow: rejected because it duplicates the gate contract.
  - Run only unit tests: rejected because it omits build, coverage, repository and CLI checks.

## Decision: Make the gate independent of the local RTK executable

- **Decision**: Refactor the gate's child-process launcher to execute native commands in a clean environment, while retaining RTK only as an optional local optimization if it is available.
- **Rationale**: `scripts/gate.mjs` currently invokes `rtk` for every subprocess. GitHub-hosted runners do not guarantee that personal development tooling exists; CI must be reproducible from repository-declared dependencies.
- **Alternatives considered**:
  - Install RTK in the workflow: rejected because it adds an undeclared external dependency to the critical path.
  - Reimplement individual checks in YAML: rejected because it breaks the single quality-gate contract.

## Decision: Use one least-privilege, cancellable workflow

- **Decision**: Define a single workflow with pull-request, push-to-`develop`, and manual triggers; read-only contents permission; one stable quality job; 20-minute timeout; and per-PR/branch concurrency cancellation.
- **Rationale**: It validates changes before and after integration, allows reruns, avoids consuming runners on superseded revisions, and has no need to write repository state or read secrets.
- **Alternatives considered**:
  - Separate PR and push workflows: rejected for v1 because it creates duplicate required-check identities and duplicated configuration.
  - Keep all historical executions running: rejected because only the newest revision is relevant for merge eligibility.

## Decision: Use the project's supported Node baseline through the current LTS line

- **Decision**: Configure Node 22 and npm dependency caching keyed by the committed lockfile.
- **Rationale**: Node 22 satisfies the project's declared minimum (`>=20.17.0`) while providing a stable hosted runner target; lockfile-based installation ensures reproducibility.
- **Alternatives considered**:
  - Floating to every runner default: rejected because a silent runtime change can make the check non-reproducible.
  - Cache `node_modules`: rejected because native dependencies and platform differences make it less reliable than npm's dependency cache.

## Decision: Configure merge enforcement outside the workflow after its first successful run

- **Decision**: Document a repository ruleset/branch-protection change requiring the stable quality job for `develop`, including up-to-date branches before merge.
- **Rationale**: Branch protection is repository administration, not source-controlled workflow behavior. The status check must first exist so its exact identity can be selected.
- **Alternatives considered**:
  - Treat a passing workflow as merge enforcement by itself: rejected because checks are advisory until a rule requires them.

## Sources

- GitHub Actions Node.js tutorial: https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs
- Workflow syntax and permissions: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- Dependency caching: https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching
- Workflow concurrency: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
- Protected branches and required checks: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
