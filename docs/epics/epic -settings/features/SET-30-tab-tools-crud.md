# Feature Specification: TabTools (CRUD) + selects por id

**Feature Branch**: `feat/set30-tab-tools-crud`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M7 (Registro de tools no App)
**Origem no plano**: S29 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "CRUD do registro (persiste no App via `action:updateToolsRegistry`); selects de tool populados
> pelos ids. Registrar/editar tool reflete nos selects." (Parte 2 §A)

UI do registro de tools: uma nova aba na página Settings permite registrar, editar e remover
entradas de tool, persistindo no App. Os selects de tool (feature, defaults, resume) passam a ser
populados pelos ids do registro.

## User Scenarios & Testing

### User Story 1 — Gerenciar tools pela UI
Como usuário, quero uma aba para cadastrar/editar/remover tools do registro, para que as novas
tools apareçam nos selects sem editar config à mão.

**Fluxo**: abre Settings → Tools → cadastra `codex-canary` → salva via
`action:updateToolsRegistry` → o id aparece nos selects de tool.

**Aceite**: registrar/editar tool reflete nos selects.

### Edge Cases
- Remover uma tool referenciada por features → definir comportamento (bloquear/avisar).
- Id duplicado → rejeitado.
- Persistência guardada por writability do `config.json` (relaciona M8).

## Requirements

### Functional Requirements
- **FR-001**: DEVE existir uma `TabTools` com CRUD do registro, persistindo via
  `action:updateToolsRegistry`.
- **FR-002**: Os selects de tool em `FeatureConfigDetail`, `DefaultsTab` e no resume DEVEM ser
  populados pelos ids do registro.
- **FR-003**: Registrar/editar uma tool DEVE refletir imediatamente nos selects.

### Key Entities
- **TabTools**: aba de gestão do registro de tools.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Cadastrar uma tool faz o id aparecer nos selects (UI focada + persistência).
- **SC-002**: Editar uma tool reflete nos selects.

## Dependencies & Open Decisions
- **Depende de**: SET-26 (idealmente também M8 para persistência de App); pode entrar como leitura
  + edição básica.
- **Decisão aberta**: comportamento ao remover tool referenciada por feature.

## Technical Notes (do plano)
- **Arquivos**: `ConfigPage.tsx` (nova `TabTools`), selects em `FeatureConfigDetail`/`DefaultsTab`/resume.
- **Validação**: UI focada + persistência.
