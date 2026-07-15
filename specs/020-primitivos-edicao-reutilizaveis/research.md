# Research: Primitivos de edicao reutilizaveis

## Decision: Keep the controls controlled and presentation-only

**Rationale**: `FeatureConfigDetail` already owns stage-local drafts and emits a
single `FeatureConfigPatch` when the user saves. Its `saveGuidance()` merges the
current `workflow.stepGuidance` map and its `useEffect` resets drafts from the
feature. Moving either responsibility into a field would duplicate state and
would violate FR-003 and FR-009.

**Alternatives considered**:

- Stateful controls with their own save/revert actions — rejected because they
  would own a second source of truth and persistence timing.
- Controls that directly emit `FeatureConfigPatch` — rejected because a generic
  field cannot know a card's patch path or validation rules.

## Decision: Implement one shared field shell plus typed primitives

**Rationale**: the existing dashboard core component directory already contains
small presentational primitives. A shared shell can centralize label association,
missing-value hint, disabled treatment, and the `modified` indicator, while each
native control remains type-appropriate.

**Alternatives considered**:

- One discriminated-union mega-component — rejected because it would mix native
  input semantics and make future consumers harder to read.
- Copy label and dirty markup into each primitive — rejected because visual
  consistency is the feature's primary value.

## Decision: Derive pending change from explicit values, never a mutable flag

**Rationale**: a primitive receives `value` and `initialValue`; it calculates
dirty state whenever it renders. Restoring the initial value therefore clears the
indicator automatically. The select must preserve a current value that is absent
from its current option list as a visible unavailable option, rather than
silently replacing it.

**Alternatives considered**:

- `useState(isDirty)` updated in change handlers — rejected because resets from
  a parent after save can desynchronize it.
- Drop an unavailable selected option — rejected because it hides a received
  configuration value and makes correction ambiguous.

## Decision: Reuse current dashboard tokens and the stage-guidance reference

**Rationale**: `FeatureConfigDetail.tsx` establishes panel/sunken surfaces,
dim borders, mono inputs, `--accent-info` active treatment, and uppercase faint
sublabels. The components use these existing tokens; disabled input behavior
matches `core/Button.tsx` (native `disabled`, `not-allowed` cursor, reduced
opacity). The implementation does not rewrite that card in SET-01.

**Alternatives considered**:

- Add a new visual theme or CSS framework — rejected as unnecessary scope and a
  risk to the approved dashboard appearance.

## Decision: Use focused component tests and an optional local web smoke check

**Rationale**: current web tests use Vitest and `react-dom/server`, while the
default Vitest configuration has no DOM environment. Test pure dirty comparison
and rendered attributes/labels directly. If native event dispatch is needed to
prove callback wiring, add a scoped DOM test environment rather than changing
the whole suite. `msq web` can then visually confirm all three controls without
running the executor.

**Alternatives considered**:

- Treat static markup alone as interaction coverage — rejected because callback
  delivery is an explicit success criterion.
- Run `msq run` as UI validation — rejected because it exercises the executor,
  not these components.
