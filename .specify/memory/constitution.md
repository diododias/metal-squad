<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.1.0
- Modified principles: I. Backlog-Driven and Traceable Delivery (expanded with
  operational DB authority, versioned intent, and non-destructive seed import).
- Added sections: explicit Project/Repository/Work Item terminology and
  compatibility constraints in Additional Constraints.
- Removed sections: none.
- Templates requiring updates:
  - updated: .specify/templates/plan-template.md
  - updated: .specify/templates/spec-template.md
  - updated: .specify/templates/tasks-template.md
  - reviewed: .specify/templates/checklist-template.md (no change required)
  - reviewed: .specify/templates/constitution-template.md (no change required)
  - not present: .specify/templates/commands/*.md
- Runtime guidance requiring updates:
  - updated: README.md
  - updated: .claude/rules/repo-context.md
  - reviewed: .claude/rules/{architecture.md,git-workflow.md,testing.md,harness.md}
- Governance artifact added: docs/adr/ADR-001-governanca-fonte-de-verdade-terminologia.md
- Follow-up TODOs: record the original adoption date and replace TODO(RATIFICATION_DATE).
-->

# metal-squad (`msq`) Constitution

## Core Principles

### I. Backlog-Driven and Traceable Delivery
Every feature, hotfix, harness change, and observable behavior change MUST have a
versioned source-of-truth artifact in the appropriate backlog, feature, hotfix,
skill, or rules location. Changes to observable behavior MUST update the related
feature or hotfix documentation. Changes to the executable backlog MUST keep the
loaded runtime catalog synchronized before web or runtime verification. The
SQLite database is authoritative for operational state; versioned specs, ADRs,
and the constitution express intent and governance. `backlog.yaml` is an import
seed and MUST be loaded with explicit conflicts and without destructive
reconciliation.

Rationale: `metal-squad` coordinates work from versioned intent, so implementation,
runtime behavior, and operational knowledge must remain traceable.

### II. Layered Ownership and Small Boundaries
Each layer MUST keep its defined responsibility: commands parse arguments and
delegate; core modules own backlog, orchestration, adapters, skills, and events;
the database layer owns SQLite access; and UI code owns presentation only. UI code
MUST NOT access the filesystem or spawn processes directly. Adapter-specific
process behavior MUST reuse common helpers when the behavior is shared. A backlog
contract change MUST update its schema, loader, prompt builder, and corresponding
tests together.

Rationale: explicit ownership prevents duplicated rules, hidden coupling, and
regressions that are difficult to isolate in an orchestrator.

### III. Validation Gates and Test Discipline
Changes to `src/` or `tests/` MUST pass `npm run build`, `npm test`, and
`npm run typecheck`; `npm run lint` MUST also pass when relevant TypeScript source
is changed. New or changed behavior MUST have automated coverage, or the plan MUST
record why existing coverage is sufficient or why coverage is not applicable.
Documentation, skill, and rule changes MUST be checked for valid paths, consistent
references, and contradictions between canonical and compatibility guidance.

Rationale: a successful process exit is not enough evidence for a tool that can
fail before an adapter starts or persist incomplete state.

### IV. Observable and Recoverable Runtime
Runner and adapter behavior MUST expose actionable status, output, heartbeat,
error, gate, and stage information through the event and persistence paths. A real
`msq` execution MUST be supported by at least two of these concrete signals: a
persisted run; useful adapter output or heartbeat; and a diff, commit, or produced
artifact where applicable. Stage completion MUST remain distinct from pipeline
completion. Resume and stale-state repair MUST use persisted checkpoints rather
than silently restarting work.

Rationale: operators need evidence of what ran, what stopped, and where recovery
can continue instead of relying on process liveness or exit codes alone.

### V. Safe Execution and Harness Separation
Normal repository work MUST follow `.claude/skills/dev-flow/SKILL.md`. Validation of
the `msq` executor MUST follow `.claude/skills/msq-develop/SKILL.md` as a QA flow:
it MUST rebuild before execution, MUST NOT manually implement the target feature,
and MUST NOT launch nested `msq run` or equivalent runners. Harness failures MUST be
recorded as hotfix or feature work. Agents MUST work in the current checkout and
MUST NOT create worktrees inside this repository.

Rationale: testing the orchestrator is only meaningful when the executor is the
subject under test and its failures remain visible as product work.

## Additional Constraints

- The supported runtime baseline is Node.js `>=20.17`, TypeScript, YAML backlog
  input, and SQLite persistence. Real feature runs use the global database unless
  a sandboxed harness has first proved that the global path is not writable.
- `README.md`, `.claude/rules/`, `backlog.yaml`, feature specs, and hotfix records
  are the repository context sources. Placeholder architecture documents MUST NOT
  be treated as confirmed design.
- The web dashboard is the official UI for new work. The Ink TUI remains available
  only as a legacy interface; new features, improvements, and hotfixes MUST target
  the web dashboard. A new task touching TUI-only code MUST remove it rather than
  extend it, unless removal would break the legacy command or a shared data
  contract.
- `.claude/` is the canonical repository skill and rules location. `.agents/` may
  provide compatibility shims but MUST NOT become a conflicting source of truth.
- The Projects domain uses `Project`, `Epic`, `Work Item`, and `Task`. `feature`
  and `bug` are `WorkItemType` values. New contracts MUST use `WorkItem`,
  `WorkItemCatalogEntry`, `workItemId`, `action:createWorkItem`, and
  `msq work-items`.
- Defaults inherited by a Work Item are **Repository defaults**, with exactly two
  execution levels: Work Item -> Repository defaults. Existing names such as
  `projectDefaults`, `backlog_features`, `feature_id`, and `FeatureSchema` are
  compatibility aliases only and MUST be marked as legacy when documented.
- `Demand` and `Backlog Item` MUST NOT be used as domain entity names. Backlog is
  a view/state containing Work Items.
- Project, Epic, Work Item, Repository, and template identities MUST be opaque
  UUID v4 values. A Repository belongs to at most one Project; an Epic has no
  operational Repository; cross-Repository dependencies are out of scope.

## Development Workflow

- Classify each change as a feature, hotfix, harness change, or docs/skills/rules
  change before implementation and keep the corresponding artifact current.
- Plans MUST complete the Constitution Check before research and after design.
  Any violation MUST be resolved or documented in Complexity Tracking with a
  simpler alternative and the reason it was rejected.
- Commits MUST follow relevant validation. Conventional Commit messages are
  preferred. Pull requests use `develop` as their base, and agents MUST NOT merge
  pull requests on their own.
- User approval, input, pause, resume, and abort controls MUST be represented by
  persisted state and must not be inferred only from a stale UI snapshot.

## Governance

This constitution is the governing project policy. A change to a principle,
mandatory constraint, or governance rule MUST be made through the constitution
update workflow, include a Sync Impact Report, and update affected templates and
runtime guidance in the same change. Reviewers MUST check the Constitution Check,
the applicable validation gates, source-of-truth documentation, and evidence
claims before accepting a change.

Versioning follows semantic versioning: MAJOR for incompatible principle removals
or redefinitions, MINOR for new principles or materially expanded mandatory
guidance, and PATCH for clarifications and non-semantic wording changes. Every
amendment MUST update `LAST_AMENDED_DATE` in ISO format and explain the bump.

The original adoption date is not recorded in repository history:
`TODO(RATIFICATION_DATE): record the original constitution adoption date.` Until
that date is known, the TODO is the only intentionally deferred governance field.

**Version**: 1.1.0 | **Ratified**: TODO(RATIFICATION_DATE) | **Last Amended**: 2026-07-17
