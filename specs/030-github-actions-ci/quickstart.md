# Quickstart: Validate GitHub Actions CI

## Prerequisites

- A clone of the repository with a supported Node version (20.17 or newer)
- Access to open a pull request against `develop`

## Local validation

Run the same complete project gate the workflow will run:

```bash
npm run gate:full
```

Expected result: build, migration in a disposable database, typecheck, lint, tests, coverage gate, repository checks, and CLI smoke test pass. No global `metal-squad` catalog is changed.

## Pull-request validation

1. Open or update a pull request targeted at `develop`.
2. Confirm that the `CI / qualidade-completa` check starts.
3. Inspect the job log and confirm that its only project validation command is `npm run gate:full`.
4. Confirm success for a valid revision.
5. Update the same pull request while the check is running; the prior run must be cancelled and the new run must continue.

## Push and manual validation

- Push an already reviewed change to `develop` and confirm the same check starts.
- Use the GitHub Actions manual-run control and confirm that it produces the same job and result.

## Merge enforcement

After observing a successful check, configure the `develop` ruleset as specified in [ci-workflow.md](./contracts/ci-workflow.md). A pull request with a failing or missing required check must not be mergeable.
