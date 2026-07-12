# Implementation Plan: Remove OVERRIDE PONTUAL

**Branch**: `007-remove-override-pontual` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-remove-override-pontual/spec.md`

## Summary

Remover toda a infraestrutura de "Override pontual" (one-time override) introduzida em F34. Apos F36, a unica forma de customizar parametros de feature e via "Save Config" (persistencia no banco). A remocao abrange: componente `OverrideSection` no frontend, estado de override, flags CLI `--tool`/`--model`/`--effort`, parametro `overrides` no protocolo WebSocket, logica de in-memory mutation no `run.ts`, CSS `.override-fields`, e o estado `tokenEstimatesByTool` (consumido exclusivamente pelo OverrideSection). Documentacao (F34, F36, ROADMAP) deve ter referencias atualizadas.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js >=20.17.0

**Primary Dependencies**: commander (CLI), React 18 + Ink 5 (TUI), better-sqlite3 (DB), ws (WebSocket), zod (schema validation)

**Storage**: SQLite via better-sqlite3 (F35 backlog catalog)

**Testing**: vitest 3.0

**Target Platform**: CLI + local web server (macOS/Linux)

**Project Type**: CLI tool with embedded web UI

**Performance Goals**: N/A (cleanup feature, no new functionality)

**Constraints**: Zero new dependencies, zero schema migrations, zero new APIs

**Scale/Scope**: 7 arquivos fonte + 3 arquivos de documentacao para modificar/remover

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution file contains placeholder templates (not yet ratified). No enforceable gates.

**Self-assessment**:
- No new dependencies introduced — PASS
- No schema changes — PASS
- No breaking API additions — PASS
- Pure removal/cleanup — PASS

## Project Structure

### Documentation (this feature)

```text
specs/007-remove-override-pontual/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (by /speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── commands/
│   └── run.ts                    # CLI: remover flags --tool/--model/--effort + in-memory mutation
├── web/
│   ├── server.ts                 # WebSocket: remover parametro overrides de startFeature()
│   ├── types.ts                  # Remover overrides do tipo WebSocketClientMessage
│   ├── state.ts                  # Remover collectTokenEstimatesByTool + tokenEstimatesByTool
│   └── static/
│       ├── app.js                # Remover envio de overrides ao start feature
│       ├── styles.css            # Remover .override-fields CSS
│       └── components/
│           └── FeaturePreview.js # Remover OverrideSection, estado de override, handlers

docs/
├── features/
│   ├── F34-web-run-detail-and-control-polish.md  # Atualizar referencias a override
│   ├── F36-web-feature-config-persistence.md     # Atualizar referencias a override
│   └── F37-remove-override-pontual.md            # Feature brief (referencia)
└── ROADMAP.md                                     # Atualizar mencao a override pontual
```

**Structure Decision**: Single project (CLI + embedded web). Modificacoes pontuais em 7 arquivos fonte + 3 docs.

## Complexity Tracking

> No violations to justify — pure removal feature.
