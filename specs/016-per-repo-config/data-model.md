# Data Model: F22 - Per-Repo Config

## Entity: GlobalConfig

**Description**: User-wide Metal Squad settings loaded from `~/.config/metal-squad/config.json`.

**Fields**:
- `concurrency: number`
- `toolTimeoutMs: number`
- `staleRunThresholdMinutes: number`
- `promptContextCharLimit: number`
- `theme?: string`
- `telegramChatId?: string`
- `notifications: { channels: NotificationChannel[]; events: NotificableEvent[] }`
- `workflow: { autoAdvanceStages: boolean; pollIntervalMs: number }`
- `budget: { alertAtPercent: number; lastResetDate?: string }`
- `web: { host: string; port: number; auth: 'token' | 'none' }`
- `stageSkills: Record<string, string[]>`

**Validation rules**:
- Must continue using the existing `ConfigSchema`.
- Legacy normalization remains supported before validation.

## Entity: RepoConfig

**Description**: Repository-local settings loaded from `.msq/config.yaml`.

**Fields**:
- `runtime?: Partial<GlobalConfig-compatible settings>`
- `defaults?: RepoExecutionDefaults`

**Validation rules**:
- File is optional.
- If present, YAML must parse successfully.
- Resolved values must validate against repo-config schema after env interpolation.
- Error messages must identify `.msq/config.yaml` as the source.

## Entity: RepoExecutionDefaults

**Description**: Repository-level execution defaults that sit between global config and backlog defaults.

**Fields**:
- `tool?: 'claude' | 'codex' | 'opencode'`
- `model?: string`
- `effort?: 'low' | 'medium' | 'high'`
- `skills?: string[]`
- `stageSkills?: Record<string, string[]>`
- `workflow?: Partial<Feature.workflow-compatible defaults>`
- `retry?: Partial<Feature.retry-compatible defaults>`
- `maxTokens?: number`

**Validation rules**:
- Must be merge-compatible with existing backlog/feature execution fields.
- Optional fields must inherit cleanly from broader layers.

## Entity: BacklogDefaults

**Description**: Defaults declared in `backlog.yaml` under `defaults`.

**Fields**:
- `tool`
- `effort`
- `skills`
- `stageSkills`

**Validation rules**:
- Existing v2 backlog schema remains valid.
- Repo defaults override global/repo runtime only where explicitly designed; backlog defaults still outrank repo defaults.

## Entity: FeatureOverrides

**Description**: Per-feature settings already stored in backlog feature entries.

**Fields**:
- `tool`
- `model`
- `effort`
- `skills`
- `workflow`
- `retry`
- `maxTokens`
- `autoStart`

**Validation rules**:
- Existing feature schema remains the highest-precedence feature layer.

## Entity: ResolvedConfigView

**Description**: Fully merged configuration returned to CLI/TUI/web inspection and runtime consumers.

**Fields**:
- `sources: { globalConfigPath: string; repoConfigPath?: string; backlogPath?: string; featureId?: string }`
- `runtime: GlobalConfig`
- `defaults: RepoExecutionDefaults merged with BacklogDefaults`
- `feature?: FeatureOverrides-resolved execution view`
- `precedence: ['global', 'repo', 'backlog', 'feature']`

**Validation rules**:
- Must contain only post-interpolation values.
- Must clearly distinguish absent layers from empty objects.

## Relationships

- `RepoConfig.runtime` overrides `GlobalConfig`.
- `RepoConfig.defaults` overrides broader execution defaults but is itself overridden by `BacklogDefaults`.
- `FeatureOverrides` override all broader execution layers for a specific feature.
- `ResolvedConfigView` materializes the merged state of all applicable entities.

## State Transitions

1. `GlobalConfig` loads.
2. Optional `RepoConfig` loads and interpolates env vars.
3. Runtime-effective config is produced.
4. Optional backlog defaults are merged for repo execution context.
5. Optional feature overrides are merged for feature-specific execution context.
6. Any invalid or unresolved state terminates with a source-specific error instead of partial fallback.
