# Feature Specification: Remover visão "by workflow stage"

**Feature Branch**: `feat/set07-remover-visao-by-stage`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Feature: SET-07 — Remover visão by workflow stage. Remover `viewMode`, o toggle, o branch `else` e a constante hardcoded `WORKFLOW_STAGES` do `BoardPage.tsx`. Board só por status."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Board único por status (Priority: P1)

Como usuário do dashboard web, quero abrir o board e ver as features organizadas apenas por
status (TODO / IN PROGRESS / DONE / FALHA), sem precisar escolher ou encontrar um toggle de
visão, para que o board não dependa de uma lista global de stages que não representa mais
features com steps heterogêneos.

**Why this priority**: É o único comportamento observável da feature — sem essa mudança, o board
continua expondo uma visão (`by workflow stage`) que ficará desalinhada assim que os steps
passarem a ser definidos por feature (SET-08/SET-09). É a mudança que justifica a feature inteira.

**Independent Test**: Abrir `msq web` (ou renderizar `BoardPage` isoladamente em teste), verificar
que as colunas exibidas são exatamente TODO/IN PROGRESS/DONE/FALHA e que não existe nenhum
controle de alternância de visão na tela.

**Acceptance Scenarios**:

1. **Given** o board carregado com features em diferentes status, **When** o usuário abre a
   página, **Then** as colunas exibidas são TODO, IN PROGRESS, DONE e FALHA, na ordem existente
   hoje.
2. **Given** a tela do board renderizada, **When** o usuário procura por um controle de troca de
   visão, **Then** nenhum toggle de "status vs workflow stage" está presente.

---

### Edge Cases

- Remover o branch `else` (visão por stage) não pode quebrar a montagem dos cards nem a leitura
  de dados que já vinham de `viewMode === 'status'` — esse caminho deve continuar funcionando
  exatamente como antes.
- Nenhuma referência remanescente a `viewMode` ou `WORKFLOW_STAGES` em `BoardPage.tsx` ou em
  qualquer outro arquivo do repositório (imports, testes, tipos).
- Steps de feature (cobertos por SET-08/SET-09) não são reintroduzidos por esta feature — o board
  fica só por status até que essas features futuras tragam a nova representação de steps.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O estado `viewMode` DEVE ser removido de `BoardPage.tsx`.
- **FR-002**: O toggle de alternância de visão (UI que permitia trocar entre "status" e "workflow
  stage") DEVE ser removido de `BoardPage.tsx`.
- **FR-003**: O branch condicional que renderizava a visão por "workflow stage" (o caminho
  `else`/`viewMode !== 'status'`) DEVE ser removido de `BoardPage.tsx`.
- **FR-004**: A constante hardcoded `WORKFLOW_STAGES` DEVE ser removida de `BoardPage.tsx`.
- **FR-005**: O board DEVE renderizar apenas colunas por status: TODO, IN PROGRESS, DONE, FALHA.
- **FR-006**: Não DEVE restar nenhuma referência órfã a `viewMode` ou `WORKFLOW_STAGES` em
  `BoardPage.tsx` nem em outros arquivos do repositório (código ou testes).

### Key Entities

- **BoardPage**: página do dashboard web que lista features em colunas; passa a ter uma única
  representação, por status, sem alternância de visão.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O board renderiza colunas por status sem nenhum controle de alternância de visão,
  verificável por teste de UI do board.
- **SC-002**: `rtk npm run typecheck` passa sem erros relacionados a símbolos removidos
  (`viewMode`, `WORKFLOW_STAGES`).
- **SC-003**: Uma busca por `viewMode` e `WORKFLOW_STAGES` no repositório não retorna nenhuma
  ocorrência fora de histórico/documentação de mudança.

## Assumptions

- A visão por status já é a visão padrão/funcional hoje (`viewMode === 'status'`) e não muda de
  comportamento — apenas o caminho alternativo (`else`) e o controle de troca são removidos.
- Steps por feature (SET-08/SET-09) estão fora de escopo desta feature; esta feature não introduz
  nenhuma substituição para a visão por stage, apenas a remove.
- Esta é uma feature de limpeza de UI/código, sem impacto em dados persistidos (SQLite) ou em
  contratos de API do backend.
