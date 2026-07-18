# Feature Specification: UI thinking + ignore-with-warning

**Feature Branch**: `feat/set25-ui-thinking-ignore-with-warning`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M6 (`model`/`effort`/`thinking` reais por adapter)
**Origem no plano**: S24 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Toggle `thinking`; parâmetro não suportado pela tool = ignorado com aviso visível (não
> sequestra outro campo). UI mostra/permite só o suportado por `capabilities`." (Parte 2 §B)

Fecha o M6 na UI: adiciona o toggle `thinking` e, com base em `capabilities` da tool selecionada,
mostra apenas o que é suportado — parâmetros não suportados aparecem ignorados com aviso, sem
sequestrar outro campo (fim do comportamento antigo de effort virar model).

## User Scenarios & Testing

### User Story 1 — UI reflete as capabilities da tool
Como usuário, quero que a UI só ofereça os parâmetros que a tool suporta e avise quando um
parâmetro é ignorado, para não configurar algo que não terá efeito.

**Fluxo**: seleciona uma tool → a UI lê `capabilities` → habilita/desabilita `effort`/`thinking`
conforme suporte → parâmetro não suportado aparece com aviso, sem afetar outro campo.

**Aceite**: UI mostra/permite só o suportado por `capabilities`.

### Edge Cases
- Trocar a tool selecionada reavalia as capabilities e o estado dos campos.
- Um parâmetro não suportado nunca "vaza" para outro campo.

## Requirements

### Functional Requirements
- **FR-001**: DEVE existir um toggle `thinking` em `FeatureConfigDetail.tsx` e no `DefaultsTab`.
- **FR-002**: A UI DEVE mostrar/permitir apenas os parâmetros suportados por `capabilities` da tool.
- **FR-003**: Parâmetro não suportado DEVE aparecer ignorado com aviso visível, sem sequestrar outro campo.

### Key Entities
- **capabilities**: dita quais campos a UI habilita por tool.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Selecionar uma tool sem thinking desabilita/avisa o toggle (UI focada).
- **SC-002**: Nenhum parâmetro não suportado altera outro campo.

## Dependencies & Open Decisions
- **Depende de**: SET-22, SET-23, SET-24.

## Technical Notes (do plano)
- **Arquivos**: `FeatureConfigDetail.tsx`, `ConfigPage.tsx` (DefaultsTab).
- **Validação**: UI focada.
