# Feature Specification: Hardcodes → config

**Feature Branch**: `feat/set42-hardcodes-para-config`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M9 (Consolidação, limpeza e docs)
**Origem no plano**: S41 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`heartbeatMs` (App), piso timeout codex → `minTimeoutMs` (registro), `versionCheck` (registro),
> stages default → template de Projeto, mapa stage→skills → default de Projeto (desacoplar do
> speckit), inferência skill→stage → config/metadado. Nenhum desses valores permanece hardcoded no
> adapter." (Parte 2 §I)

Varredura final de hardcodes: cada valor mágico ganha um dono de config. Inclui desacoplar o mapa
stage→skills do speckit e mover a inferência skill→stage para config/metadado.

## User Scenarios & Testing

### User Story 1 — Nenhum valor mágico no adapter
Como mantenedor, quero que heartbeat, piso de timeout, versionCheck, stages default e mapas
stage↔skills venham de config, para configurar sem tocar no código do adapter.

**Fluxo**: os valores passam a ser lidos de: `heartbeatMs` (App), `minTimeoutMs`/`versionCheck`
(registro), stages default e mapa stage→skills (template de Projeto), inferência skill→stage
(config/metadado).

**Aceite**: nenhum desses valores permanece hardcoded no adapter.

### Edge Cases
- Mapa stage→skills desacoplado do speckit sem quebrar backlogs speckit existentes.
- Ausência de config usa default coerente (sem regressão).

## Requirements

### Functional Requirements
- **FR-001**: `heartbeatMs` DEVE vir do App; `minTimeoutMs` e `versionCheck`, do registro.
- **FR-002**: Stages default e o mapa stage→skills DEVEM vir de um template de Projeto (desacoplado do speckit).
- **FR-003**: A inferência skill→stage DEVE vir de config/metadado.
- **FR-004**: Nenhum desses valores DEVE permanecer hardcoded no adapter (`SKILL_STAGE_MAP` incluído).

### Key Entities
- **Template de Projeto**: fonte de stages default e mapa stage→skills.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Suites de adapters e backlog confirmam valores vindo de config, sem regressão.
- **SC-002**: Nenhum número/mapa mágico remanescente nos adapters.

## Dependencies & Open Decisions
- **Depende de**: M6, M7.

## Technical Notes (do plano)
- **Arquivos**: adapters, `src/core/workflow/stageSkills.ts`, `schema.ts`, `claude.ts` (`SKILL_STAGE_MAP`).
- **Validação**: suites de adapters + backlog.
