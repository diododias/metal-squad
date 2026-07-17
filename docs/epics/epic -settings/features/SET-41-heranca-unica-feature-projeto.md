# Feature Specification: Herança única Feature→Projeto

**Feature Branch**: `feat/set41-heranca-unica-feature-projeto`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M9 (Consolidação, limpeza e docs)
**Origem no plano**: S40 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Fim da cascata de 4 camadas; só Feature herda de Projeto; App fora da herança de execução.
> `msq config show --feature <id>` reflete só os dois níveis." (Parte 2 §H)

Simplifica o modelo de herança: em vez de 4 camadas, a resolução de execução tem só dois níveis —
Feature herda de Projeto. O App sai da herança de execução (fica com config de infraestrutura).

## User Scenarios & Testing

### User Story 1 — Resolução em dois níveis
Como usuário, quero que a config de execução de uma feature seja resolvida só por Feature→Projeto,
para entender de onde vem cada valor sem uma cascata de 4 camadas.

**Fluxo**: `msq config show --feature <id>` → mostra a resolução considerando apenas Feature e
Projeto; o App não participa da herança de execução.

**Aceite**: `msq config show --feature <id>` reflete só os dois níveis.

### Edge Cases
- Feature sem override herda inteiramente do Projeto.
- Nenhum valor de execução vem do App (App fora da herança).

## Requirements

### Functional Requirements
- **FR-001**: A herança de execução DEVE ter só dois níveis: Feature herda de Projeto.
- **FR-002**: O App DEVE sair da herança de execução (`mergeExecutionDefaults`, `src/ui/catalog.ts`).
- **FR-003**: `msq config show --feature <id>` DEVE refletir apenas Feature→Projeto.

### Key Entities
- **mergeExecutionDefaults**: passa a considerar só Feature e Projeto.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Testes de resolução de defaults confirmam dois níveis (Feature→Projeto).
- **SC-002**: Nenhum valor de execução é herdado do App.

## Dependencies & Open Decisions
- **Depende de**: M4.
- **Relaciona**: SET-37 (defaults no Projeto), SET-44 (regressão e2e).

## Technical Notes (do plano)
- **Arquivos**: `src/config/index.ts` (`mergeExecutionDefaults`), `src/ui/catalog.ts`.
- **Validação**: testes de resolução de defaults.
