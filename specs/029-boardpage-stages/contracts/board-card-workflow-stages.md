# Contract: BoardPage to KanbanCard workflow stages

## Scope

Internal React component contract for the web dashboard. No HTTP, WebSocket, or
database schema contract changes.

## Input extension

`KanbanCardRun` (provided by SET-08) accepts:

```ts
stages?: string[];
```

`BoardPage` supplies it as follows:

| Card kind | Feature lookup | `stages` value |
|---|---|---|
| TODO | the pending feature `f` | `f.workflow.stages` |
| Run with a catalog entry | `state.featureCatalog[r.featureId]` | `entry.workflow.stages` |
| Run with no catalog entry | lookup returns `undefined` | omitted / `undefined` |

## Behavioral guarantees

- The page supplies stages from the represented feature only; it never uses a
  shared global workflow.
- The same feature has the same supplied stage sequence on its TODO and run
  cards.
- `undefined` means configuration is unavailable; the card remains usable.
- `[]` is a valid explicit configuration and must remain empty.

## Consumer requirements

The card must treat `stages` as optional. Its rendering implementation belongs
to SET-08; SET-09 only fulfills the producer side of this contract.
