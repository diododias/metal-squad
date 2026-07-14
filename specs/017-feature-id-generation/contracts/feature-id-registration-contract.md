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

The input may contain any `id`. The value is an opaque source alias only and is
never used as the persisted feature identity. Empty, whitespace/control-
containing, duplicate, and malformed values are ignored for ID generation.

The allocator receives the occupied global ID set from the catalog boundary;
callers must not claim uniqueness from a local list alone.

## Output

```ts
interface FeatureRegistrationResult {
  feature: Feature;       // always has a required, normalized id
  assigned: true;         // every loaded feature receives a new ID
  idKind: 'generated';
  previousId?: string;    // source alias used for reconciliation only
}
```

Generated IDs use exactly eight characters from
`23456789ABCDEFGHJKMNPQRSTVWXYZ`, are selected randomly, and are retried when
the candidate is already occupied by any catalog or by an earlier item in the
same batch.

## Batch CLI behavior

`msq backlog load` MUST:

1. Parse and validate the input backlog.
2. Allocate a new ID for every feature against the global catalog and batch.
3. Rekey matching catalog references to the generated IDs.
4. Stage removal of the consumed entries from `backlog.yaml`.
5. Publish the normalized backlog to the SQLite catalog in one transaction.
6. Commit the YAML removal and report generated IDs only after publication succeeds.

`--dry-run` MUST perform steps 1-3 and show the prospective diff, but MUST NOT
modify `backlog.yaml` or SQLite.

An allocation/publication failure MUST leave no conflicting catalog row and MUST
not replace the original YAML with a different ID set.

## Persistence and compatibility

- A successful load removes the consumed feature entries from `backlog.yaml`.
- A later empty load retains the published catalog rows.
- Existing catalog rows and their dependencies, runs, gates, pipelines,
  notifications, and history are rekeyed to the generated ID when matched.

## Board display contract

The web board MUST display the persisted catalog ID when the catalog contains a
matching feature entry. A deterministic short hash MAY be shown only for an old
run payload that has no matching persisted ID; this value is display-only and
MUST NOT be sent to the server as a feature identity or persisted in the catalog.

## Error contract

Errors MUST be actionable and identify:

- the feature location/title when generation or reconciliation fails;
- the conflicting ID and owning repository for a global collision; and
- that no catalog update was committed when publication is rolled back.
