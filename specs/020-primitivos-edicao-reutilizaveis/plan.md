# Implementation Plan: Primitivos de edicao reutilizaveis

**Branch**: `020-primitivos-edicao-reutilizaveis` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-primitivos-edicao-reutilizaveis/spec.md`

## Summary

Introduce three controlled, UI-only editing primitives for the web dashboard:
text, select, and boolean toggle. They will share a field shell that associates
the label with its control, derives and displays a pending-change state from the
parent-provided initial and current values, and handles disabled and missing
values consistently. The controls emit values through callbacks only; a future
configuration card remains responsible for draft state, validation, persistence,
and saving.

## Technical Context

**Language/Version**: TypeScript 5.7, React 18.3, Node.js >=20.17

**Primary Dependencies**: React, React DOM, esbuild; no new runtime dependency

**Storage**: N/A — components must not access SQLite, the backlog catalog, files, or the network

**Testing**: Vitest 3; component markup tests use `react-dom/server`; interaction coverage uses a focused DOM test environment only if the existing test runtime cannot dispatch native input events

**Target Platform**: Modern browser served by `msq web`

**Project Type**: Web-dashboard component library inside a TypeScript CLI project

**Performance Goals**: Immediate local update indication for one field; no asynchronous work, I/O, or additional WebSocket traffic per keystroke

**Constraints**: Controlled props only; accessible label/control association; disabled native control behavior; preserve the dashboard token system and the existing step-guidance editing appearance; no persistence or configuration-card reconstruction

**Scale/Scope**: Four small UI modules (one shell plus three primitives), one focused test suite, and an internal component contract; designed for five follow-on Settings cards

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Source of truth — PASS**: `specs/020-primitivos-edicao-reutilizaveis/spec.md` is the feature source; this plan and its contracts record the reusable UI boundary. No backlog schema or runtime catalog behavior changes.
- **Layer ownership — PASS**: `src/web/client/components/core/` owns presentation-only primitives. A consuming card owns the initial/current values, local drafts, save/revert, and `FeatureConfigPatch` emission. No command, core, database, or server ownership changes.
- **Validation — PASS**: implementation will run `npm run build`, `npm test`, `npm run typecheck`, and `npm run lint`. Focused component tests cover change derivation, labels, missing values, disabled behavior, and callback delivery.
- **Runtime evidence — NOT REQUIRED**: this is an isolated browser-presentation feature with no executor, catalog, or persistence change. A local `msq web` smoke check is useful supplementary evidence, not a harness run.
- **Harness safety — PASS**: do not use `msq-develop` or launch `msq run`; this work validates dashboard components rather than the executor.
- **UI scope — PASS**: all new UI is under the official web dashboard; `src/ui/` is untouched.

**Post-design re-check**: PASS. The data model and component contract retain the same ownership: no hidden local persistence, no wire-contract expansion, and no new coupling outside the web client.

## Project Structure

### Documentation (this feature)

```text
specs/020-primitivos-edicao-reutilizaveis/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
```text
src/web/client/
├── components/
│   ├── FeatureConfigDetail.tsx       # visual and interaction reference only
│   └── core/
│       ├── EditableFieldShell.tsx    # label, hint, dirty state, shared layout
│       ├── EditableTextField.tsx     # controlled string field
│       ├── EditableSelectField.tsx   # controlled option field
│       └── EditableToggleField.tsx   # controlled boolean field
└── ...

tests/web/
└── editable-controls.test.tsx        # focused primitive behavior and markup tests

specs/020-primitivos-edicao-reutilizaveis/
├── research.md
├── data-model.md
├── contracts/editable-controls.md
└── quickstart.md
```

**Structure Decision**: add the primitives beside the existing `Button`, `Card`,
`StatusPill`, and `Tag` core components. `FeatureConfigDetail.tsx` remains the
approved stage-guidance editing reference and keeps its feature-patch/save
boundary; SET-02 through SET-06 adopt the primitives in their own scope.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
