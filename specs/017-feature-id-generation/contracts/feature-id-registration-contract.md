# Feature ID Registration Contract

## Purpose

This contract defines the identity boundary used by `msq backlog load` and by a
future online feature-creation channel. It covers `Feature` IDs only; Epic IDs
are not part of the contract.

## Input

```ts
type FeatureRegistrationInput = Omit<Feature, 'id'> & {
  id?: string;
};
```

The input may omit `id`. When present:

- `F-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}` is canonical and is preserved.
- `feat-N` and other non-empty manual IDs without whitespace/control characters
  are preserved exactly.
- Empty, whitespace/control-containing, or malformed reserved `F-` values are
  rejected before persistence.

The allocator receives the occupied global ID set from the catalog boundary;
callers must not claim uniqueness from a local list alone.

## Output

```ts
interface FeatureRegistrationResult {
  feature: Feature;       // always has a required, normalized id
  assigned: boolean;      // true only when input omitted id
  idKind: 'generated' | 'legacy' | 'manual';
}
```

Generated IDs use exactly eight characters from
`23456789ABCDEFGHJKMNPQRSTVWXYZ`, are selected randomly, and are retried when
the candidate is already occupied by any catalog or by an earlier item in the
same batch.

## Batch CLI behavior

`msq backlog load` MUST:

1. Parse and validate the input backlog.
2. Reject duplicate or malformed explicit feature IDs before writing.
3. Allocate IDs for omitted fields against the global catalog and current batch.
4. Stage the same normalized IDs into `backlog.yaml`.
5. Publish the normalized backlog to the SQLite catalog in one transaction.
6. Report the IDs in the catalog diff only after publication succeeds.

`--dry-run` MUST perform steps 1-3 and show the prospective diff, but MUST NOT
modify `backlog.yaml` or SQLite.

An allocation/publication failure MUST leave no conflicting catalog row and MUST
not replace the original YAML with a different ID set.

## Persistence and compatibility

- A second load of the same materialized YAML returns the same IDs and reports
  unchanged features.
- Reordering a feature, changing its title, or changing its `specFile` does not
  change its explicit persisted ID.
- Removed features are archived according to the existing catalog behavior; an
  archived ID is not reused for a new feature.
- Dependencies, runs, gates, pipelines, notifications, and history compare IDs
  as opaque strings and support canonical, legacy, and manual values equally.

## Board display contract

The web board MUST display the persisted catalog ID when the catalog contains a
matching feature entry. A deterministic short hash MAY be shown only for an old
run payload that has no matching persisted ID; this value is display-only and
MUST NOT be sent to the server as a feature identity or persisted in the catalog.

## Error contract

Errors MUST be actionable and identify:

- the feature location/title when the ID is missing or malformed;
- the invalid value and rule violated for explicit IDs;
- the conflicting ID and owning repository for a global collision; and
- that no catalog update was committed when publication is rolled back.
