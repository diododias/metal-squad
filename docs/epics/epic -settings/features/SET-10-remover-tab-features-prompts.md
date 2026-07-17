# Feature Specification: Remover tab "Features & Prompts" do Config

**Feature Branch**: `feat/set10-remover-tab-features-prompts`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M2 (Board por workflow de feature + limpeza do Config)
**Origem no plano**: S10 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Remover a sub-tab e `FeaturesPromptsTab`; ajustar header (não é mais 'read-only except
> Features & Prompts'). Edição de feature só pelo card."

Com a edição de feature restaurada nos cards (M1), a tab "Features & Prompts" da página de
configuração fica redundante e é removida. A edição de feature passa a viver exclusivamente no
card de detalhe.

## User Scenarios & Testing

### User Story 1 — Config sem tab de features
Como usuário, quero editar features pelo card de detalhe e não por uma tab separada na config,
para ter um único lugar de edição e uma config mais enxuta.

**Fluxo**: abre a config → não há mais sub-tab "Features & Prompts" → edita features pelo card.

**Aceite**: ConfigPage sem tab de features; edição de feature só pelo card; header ajustado.

### Edge Cases
- Nenhuma rota/atalho deve apontar para a tab removida.
- O header não deve mais dizer "read-only except Features & Prompts".

## Requirements

### Functional Requirements
- **FR-001**: A sub-tab "Features & Prompts" e o componente `FeaturesPromptsTab` DEVEM ser removidos.
- **FR-002**: O header da página DEVE ser ajustado (sem a ressalva "except Features & Prompts").
- **FR-003**: Não DEVE restar referência órfã à tab/componente removidos.

### Key Entities
- **ConfigPage**: página de configuração, agora sem a tab de features.

## Success Criteria

### Measurable Outcomes
- **SC-001**: A ConfigPage não renderiza a tab de features (UI focada).
- **SC-002**: `rtk npm run typecheck` passa sem referência a `FeaturesPromptsTab`.

## Dependencies & Open Decisions
- **Depende de**: M1 (edição vive no card).
- **Relaciona**: SET-10b (renomeação para "Settings").

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/pages/ConfigPage.tsx`.
- **Validação**: UI focada.
