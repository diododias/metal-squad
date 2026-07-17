# Feature Specification: Primitivos de edição reutilizáveis

**Feature Branch**: `feat/set01-primitivos-edicao`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M1 (Restaurar edição de Feature)
**Origem no plano**: S01 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Helpers controlados (label + input/select/toggle + estado de dirty) no padrão do `stepGuidance`
> que sobreviveu — componentes isolados em `src/web/client/components/core/`."

O remodel do web derrubou a edição inline de features (design §3.9, §3.11). Antes de reconstruir
os cards editáveis (SET-02..SET-06), é preciso um conjunto pequeno de primitivos controlados,
reutilizáveis, que padronizem label + campo + estado de "dirty". O único trecho editável que
sobreviveu é o `stepGuidance`; ele serve de referência de estilo e contrato.

## User Scenarios & Testing

### User Story 1 — Reutilizar um primitivo controlado
Como desenvolvedor construindo os cards editáveis, quero componentes `EditableRow`,
`EditableSelect` e `EditableToggle` controlados (valor + `onChange`), para não reimplementar
label/estado/dirty em cada card.

**Fluxo**: o card monta um `EditableSelect` passando `value`, `options` e `onChange` → o
componente renderiza label + controle → ao alterar, emite `onChange` e sinaliza estado sujo.

**Aceite**: cada componente renderiza isolado e emite `onChange`; nenhum deles guarda estado de
domínio próprio (são controlados pelo pai).

### Edge Cases
- Valor `undefined`/vazio deve renderizar placeholder sem quebrar.
- `disabled` (ex.: campo não gravável) desabilita o controle mantendo o label legível.
- Estado "dirty" é derivado da comparação com o valor inicial, não de flag manual duplicada.

## Requirements

### Functional Requirements
- **FR-001**: DEVEM existir três primitivos controlados em `src/web/client/components/core/`:
  `EditableRow.tsx` (input de texto), `EditableSelect.tsx` (select) e `EditableToggle.tsx` (toggle).
- **FR-002**: Cada primitivo DEVE ser controlado — recebe `value`/`checked` e `onChange` do pai;
  não mantém estado de domínio interno.
- **FR-003**: Cada primitivo DEVE expor o par label + controle no padrão visual do `stepGuidance`
  sobrevivente, sem regressão visual nos cards existentes.
- **FR-004**: Os primitivos DEVEM suportar `disabled` e um indicador de estado sujo (dirty)
  derivado do valor.
- **FR-005**: Os primitivos NÃO DEVEM acessar WebSocket, DB ou filesystem — apenas UI.

### Key Entities
- **EditableRow / EditableSelect / EditableToggle**: componentes de apresentação controlados.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Os três componentes renderizam isolados em teste e disparam `onChange` no evento certo.
- **SC-002**: Nenhuma regressão visual nos cards existentes que usam o padrão `stepGuidance`.
- **SC-003**: SET-02..SET-06 reutilizam os três primitivos sem recriar label/estado.

## Dependencies & Open Decisions
- **Depende de**: — (primeira feature do marco).
- **Habilita**: SET-02, SET-03, SET-04, SET-05, SET-06.
- **Decisão aberta**: forma de sinalizar "dirty" (borda/ícone) — fechar no plan visual.

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/components/core/` (`EditableRow.tsx`, `EditableSelect.tsx`, `EditableToggle.tsx`).
- **Validação**: `rtk npx vitest run tests/ui/components.test.ts`.
