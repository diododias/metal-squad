# Data Model: F52 - Registro de Features com ID Gerado Automaticamente

## Entity: FeatureIdInput

**Description**: The authoring-time identity field for a feature before batch
registration. It may be absent, but if present it is validated before any
catalog write.

**Fields**:

- `id?: string`
- `title: string`
- `spec?: string`
- `specFile?: string`
- `dependsOn: string[]`
- Existing execution/workflow/task fields from `FeatureSchema`

**Validation rules**:

- Omitted `id` requests allocation.
- Empty strings, whitespace, and control characters are invalid.
- `F-` is reserved: an explicit value beginning with `F-` is valid only when it
  matches `F-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}` exactly.
- Existing legacy `feat-N` and other manual IDs that satisfy the non-empty,
  no-whitespace/control rule are preserved byte-for-byte; no case or prefix
  normalization is applied.

## Entity: FeatureId

**Description**: The normalized, persistent identity of a feature used by the
catalog, runs, dependencies, notifications, and board routes.

**Fields**:

- `value: string`
- `kind: 'generated' | 'legacy' | 'manual'`
- `persisted: boolean`

**Validation rules**:

- Generated values have exactly the canonical `F-<8>` format and alphabet.
- Legacy/manual values are opaque strings accepted by `FeatureIdInput`.
- A value is unique across all feature rows in the shared catalog, not merely
  within one repository.

## Entity: FeatureRegistration

**Description**: The normalized feature fragment returned by the shared
registration boundary for batch and future online callers.

**Fields**:

- `feature: Feature` with required `feature.id`
- `assigned: boolean`
- `previousId?: string`
- `source: 'backlog-yaml' | 'online'`

**Validation rules**:

- `assigned` is true only when the input omitted an ID and a new value was
  allocated.
- `previousId` is present only for preserved explicit IDs, if the caller needs
  audit detail; it is not a second identity key.
- The returned feature is safe for existing `Feature` consumers because
  `id` is always present.

## Entity: FeatureCatalogRow

**Description**: The existing SQLite catalog row that persists the normalized
feature and its denormalized lookup fields.

**Fields**:

- `feature_id: string` (global primary key and persistent `FeatureId.value`)
- `epic_id: string` (foreign key to `backlog_epics`; unchanged Epic identity)
- `repo_id: string` (foreign key to `repos`)
- `title: string`
- `depends_on: string` (JSON array of opaque feature IDs)
- `spec_file: string | null`
- `position: number`
- `data_json: string` (normalized complete `Feature` JSON)
- `archived_at: string | null`
- `updated_at: string`

**Validation rules**:

- `feature_id` must be unique globally; a collision owned by another repo is a
  registration error, not an upsert/move.
- `data_json.id`, `feature_id`, and all references in `depends_on` must agree
  with the normalized feature.
- Archiving preserves rows needed by historical runs and does not release an
  ID for reuse.

## Entity: BacklogIdentityPublication

**Description**: The cross-source commit boundary for a batch load.

**Fields**:

- `backlogPath: string`
- `normalizedBacklog: BacklogV2`
- `assignedFeatureIds: string[]`
- `catalogDiff: BacklogCatalogDiff`
- `status: 'staged' | 'committed' | 'rolled-back'`

**State transitions**:

1. `staged`: YAML has been parsed, IDs validated/allocated, and a temporary
   materialized representation is ready; no catalog consumer has seen it.
2. `committed`: materialized YAML and the catalog contain the same normalized
   IDs; the CLI may report the diff and runtime may load the catalog.
3. `rolled-back`: validation, file replacement, or DB publication failed; the
   catalog transaction is rolled back and the original YAML is restored when
   possible. No partial alternate ID may be published.

## Relationships

- `BacklogIdentityPublication` contains many `FeatureRegistration` results.
- Each normalized `Feature` belongs to one `Epic` and one registered repository
  in the current catalog.
- `Feature.dependsOn` stores references to other `FeatureId.value` strings;
  the graph resolves them opaquely.
- `Run`, `Gate`, `Pipeline`, `RunOutput`, and notification events reference the
  same `FeatureId.value`; they do not own or regenerate it.

## Out of scope

- `EpicSchema.id` and `backlog_epics.epic_id` generation/migration.
- A complete online feature-creation UI or permissions model (F57).
- Mandatory conversion of legacy/manual IDs to canonical IDs.
