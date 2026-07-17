# CI Workflow Contract

## Identity

- Workflow display name: `CI`
- Required job identifier and display name: `qualidade-completa`
- Result exposed to branch protection: `CI / qualidade-completa`

## Triggers

- Pull requests whose target branch is `develop`
- Pushes to `develop`
- Manual dispatch

## Execution Contract

1. The job runs on a hosted Ubuntu environment with Node 22.
2. The job has only `contents: read` permission and requires no secret.
3. Dependency installation comes from the committed npm lockfile; npm's dependency cache may accelerate it.
4. The one project validation command is `npm run gate:full`.
5. The gate must create and use a disposable `MSQ_DB_PATH`; it must not touch the global catalog.
6. Per pull request or branch, a newer revision cancels an older in-progress CI execution.
7. The job ends within 20 minutes or reports timeout failure.

## Non-goals

- Publishing packages or artifacts
- Deployment or release automation
- Managing GitHub branch protection through repository code

## Administrative Follow-up

After the workflow has completed successfully once, configure the `develop` ruleset to require `CI / qualidade-completa` and require the source branch to be up to date before merge.
