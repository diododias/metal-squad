# Data Model: F08 Session and Run Navigation

## RepositorySummary

- Purpose: Overview-level node for each registered repo with navigable history.
- Primary source: `repos` joined with aggregated `runs`, `gates`, and latest run
  timestamps.
- Fields:
  - `repoId: string`
  - `path: string`
  - `featureCountWithRuns: number`
  - `latestRunAt: string | null`
  - `statusCounts: { running: number; done: number; failed: number; blocked: number; aborted: number }`
  - `openGateCount: number`
  - `availableTools: string[]`
- Relationships:
  - One `RepositorySummary` owns many `FeatureHistoryRecord` entries.
- Validation rules:
  - Only repos with at least one navigable run history row appear in overview.
  - Empty repos must render through an explanatory empty state, not a broken list.

## FeatureHistoryRecord

- Purpose: Repo-level node describing one feature with recorded runs inside a
  selected repo.
- Primary source: grouped `runs` for one `repo_id`, enriched by
  `backlog.yaml` catalog when present.
- Fields:
  - `repoId: string`
  - `featureId: string`
  - `title: string | null`
  - `latestRunId: number`
  - `latestStatus: 'running' | 'done' | 'failed' | 'blocked' | 'aborted'`
  - `latestRunAt: string`
  - `runCount: number`
  - `toolSet: string[]`
  - `totalTokensLatest: number | null`
  - `model: string | null`
  - `effort: string | null`
- Relationships:
  - Belongs to one `RepositorySummary`.
  - Owns many `RunHistoryEntry` records.
- Validation rules:
  - Search matches `featureId` and `title` only.
  - Missing backlog metadata falls back to `featureId` without blocking access.

## RunHistoryEntry

- Purpose: Feature-level list item for one historical run.
- Primary source: `runs` joined with `pipelines`, `token_usage`, `gates`, and
  pending `stage_requests`.
- Fields:
  - `runId: number`
  - `repoId: string`
  - `featureId: string`
  - `tool: 'claude' | 'codex' | 'opencode' | string`
  - `status: 'running' | 'done' | 'failed' | 'blocked' | 'aborted'`
  - `rawStatus: string`
  - `startedAt: string`
  - `endedAt: string | null`
  - `durationLabel: string`
  - `inputTokens: number | null`
  - `cachedInputTokens: number | null`
  - `outputTokens: number | null`
  - `totalTokens: number | null`
  - `pipelineId: number | null`
  - `pipelineStatus: string | null`
  - `pipelineCurrentStage: string | null`
  - `pendingStageRequestKind: 'approval' | 'input' | null`
  - `pendingStageRequestPrompt: string | null`
  - `hasFullOutput: boolean`
- Relationships:
  - Belongs to one `FeatureHistoryRecord`.
  - Can be referenced by `ComparisonPair`.
- Validation rules:
  - Feature history must never mix runs from other repos or features.
  - Status and token fields may be partially null for in-progress runs and must
    render as explicitly unavailable rather than as zeroes.

## RunDetail

- Purpose: Full-screen or main-panel detail representation for one selected run.
- Primary source: `RunHistoryEntry` plus `run_output`, `run_events`,
  `task_runs`, and optional backlog metadata.
- Fields:
  - `summary: RunHistoryEntry`
  - `featureTitle: string | null`
  - `declaredSkills: string[]`
  - `resumeSummary: string | null`
  - `taskRuns: TaskRun[]`
  - `runEvents: RunEventRow[]`
  - `outputLines: RunOutputRow[]`
  - `outputState: 'full' | 'partial' | 'empty'`
- Relationships:
  - One `RunDetail` belongs to one `RunHistoryEntry`.
- Validation rules:
  - The view must show all available metadata even when output is empty or still
    streaming.
  - Full log rendering should preserve ascending chronological order.

## ComparisonPair

- Purpose: Temporary comparison selection for exactly two runs from one feature.
- Fields:
  - `featureId: string`
  - `repoId: string`
  - `leftRunId: number`
  - `rightRunId: number`
  - `diffs: { status: boolean; duration: boolean; totalTokens: boolean }`
  - `validationError: string | null`
- Relationships:
  - References two `RunHistoryEntry` items from the same `FeatureHistoryRecord`.
- Validation rules:
  - Exactly two run ids must be selected before opening compare.
  - Both runs must share the same `repoId` and `featureId`.
  - Invalid selections show a user-facing explanation and do not open compare.

## FilterState

- Purpose: Current narrowing state for any list-level view.
- Fields:
  - `statuses: Array<'running' | 'done' | 'failed' | 'blocked' | 'aborted'>`
  - `tools: string[]`
  - `query: string`
  - `active: boolean`
- Relationships:
  - Attached to a single navigation level snapshot.
- Validation rules:
  - Clearing filters keeps the user on the same level and restores the full list.
  - A zero-match result must show an explicit empty state with active filter
    indicators still visible.

## NavigationSnapshot

- Purpose: Remembered state for one level in the drill-down stack.
- Fields:
  - `level: 'overview' | 'repo' | 'feature' | 'run' | 'compare'`
  - `selectedIndex: number`
  - `scrollOffset: number`
  - `filterState: FilterState`
  - `contextRepoId: string | null`
  - `contextFeatureId: string | null`
  - `selectedRunIds: number[]`
- State transitions:
  - `overview -> repo` on `enter` over a repo row
  - `repo -> feature` on `enter` over a feature row
  - `feature -> run` on `enter` over a run row
  - `feature -> compare` on compare action with a valid `ComparisonPair`
  - `run|compare|feature|repo -> parent` on `esc`
- Validation rules:
  - Returning to a parent level restores its prior snapshot unless the selected
    item no longer exists, in which case the index clamps to the nearest valid row.
