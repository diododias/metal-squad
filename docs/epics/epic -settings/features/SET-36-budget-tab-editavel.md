# Feature Specification: BudgetTab editável (App)

**Feature Branch**: `feat/set36-budget-tab-editavel`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M8 (App editável + segredos write-only)
**Origem no plano**: S35 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`alertAtPercent` editável (App); `maxTokens` do projeto migra p/ DefaultsTab (M4). Salvar
> persiste em `config.json`." (design §3.3–3.6)

Simplifica a aba de budget: no App fica apenas `alertAtPercent` (editável). O `maxTokens` do
projeto sai daqui e passa a viver na `DefaultsTab` (M4/SET-17), respeitando o princípio de "um
dono por config".

## User Scenarios & Testing

### User Story 1 — Editar o alerta de budget do App
Como usuário, quero editar `alertAtPercent` no App, para ajustar quando recebo o alerta de budget.

**Fluxo**: abre Settings → Budget → edita `alertAtPercent` → salva → persiste em `config.json`.

**Aceite**: salvar persiste em `config.json`.

### Edge Cases
- `maxTokens` do projeto não aparece mais aqui (migrou para DefaultsTab).
- Valor fora de 0–100 rejeitado.

## Requirements

### Functional Requirements
- **FR-001**: O `BudgetTab` DEVE editar `alertAtPercent` (App) e persistir em `config.json`.
- **FR-002**: `maxTokens` do projeto NÃO DEVE mais viver no BudgetTab (migra p/ DefaultsTab).
- **FR-003**: `alertAtPercent` fora de faixa DEVE ser rejeitado com feedback.

### Key Entities
- **BudgetTab**: aba de budget do App, enxuta.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Editar `alertAtPercent` e salvar atualiza `config.json` (UI focada).
- **SC-002**: `maxTokens` do projeto não aparece no BudgetTab.

## Dependencies & Open Decisions
- **Depende de**: SET-32.
- **Relaciona**: SET-17 (`maxTokens` do projeto na DefaultsTab).

## Technical Notes (do plano)
- **Arquivos**: `ConfigPage.tsx` (`BudgetTab`).
- **Validação**: UI focada.
