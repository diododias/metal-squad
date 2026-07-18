# Feature Specification: Remover tab "Features & Prompts" do Config

**Feature Branch**: `feat/set10-remover-tab-features-prompts`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Feature: SET-10 — Remover tab Features & Prompts do Config. Remover a sub-tab e `FeaturesPromptsTab`; ajustar header (não é mais 'read-only except Features & Prompts'). Edição de feature só pelo card."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Config sem tab de features (Priority: P1)

Como usuário, quero editar features pelo card de detalhe e não por uma tab separada na página
de configuração, para ter um único lugar de edição e uma config mais enxuta.

**Why this priority**: É o único objetivo da feature — sem essa remoção, a edição de feature
continua duplicada entre o card e a tab de config, o que já foi resolvido no lado do card (M1).

**Independent Test**: Abrir a página de configuração e confirmar que não existe mais a sub-tab
"Features & Prompts" na navegação nem o conteúdo associado; confirmar que editar uma feature
pelo card de detalhe continua funcionando normalmente.

**Acceptance Scenarios**:

1. **Given** a página de configuração (ConfigPage) aberta, **When** o usuário observa a lista de
   sub-tabs disponíveis, **Then** a sub-tab "Features & Prompts" não está presente.
2. **Given** a página de configuração aberta, **When** o usuário lê o texto do header, **Then**
   o texto não contém mais a ressalva "except Features & Prompts".
3. **Given** o usuário quer editar uma feature, **When** ele abre o card de detalhe da feature,
   **Then** consegue editar normalmente (fluxo já entregue em M1, não afetado por esta feature).

---

### Edge Cases

- Nenhuma rota, atalho, link interno ou item de navegação deve continuar apontando para a
  sub-tab removida.
- Nenhum outro componente do web client deve importar ou referenciar `FeaturesPromptsTab` após
  a remoção.
- O restante das sub-tabs da config (runtime, defaults, skills, notifications, budget) deve
  continuar funcionando sem alteração de comportamento.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A sub-tab "Features & Prompts" DEVE ser removida da navegação da página de
  configuração.
- **FR-002**: O componente `FeaturesPromptsTab` e qualquer lógica exclusiva dele DEVEM ser
  removidos do código-fonte.
- **FR-003**: O header da página de configuração DEVE ser ajustado para não mencionar mais a
  ressalva "read-only except Features & Prompts".
- **FR-004**: Não DEVE restar nenhuma referência órfã (import, tipo, rota, string) ao componente
  ou à sub-tab removidos em nenhum arquivo do repositório.
- **FR-005**: A edição de features DEVE continuar disponível exclusivamente pelo fluxo do card
  de detalhe da feature (já entregue em M1), sem regressão de comportamento.

### Key Entities *(include if feature involves data)*

- **ConfigPage**: página de configuração do dashboard web; passa a expor apenas as sub-tabs
  não relacionadas a features (runtime, defaults, skills, notifications, budget).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A ConfigPage não renderiza a sub-tab de features em nenhum estado da UI.
- **SC-002**: A validação de qualidade do produto conclui sem erros relacionados à remoção da
  tab, ao header ou ao fluxo de edição pelo card.
- **SC-003**: Em uma revisão do produto, não existem rotas, atalhos, links ou itens de navegação
  acessíveis que levem à tab removida.
- **SC-004**: 100% dos usuários que iniciarem uma edição de feature durante a validação encontram
  o fluxo de edição no card de detalhe, sem precisar recorrer a uma segunda área de configuração.

## Assumptions

- A edição de feature pelo card de detalhe (entregue em M1) já é funcional e não faz parte do
  escopo desta feature — apenas não deve ser afetada pela remoção da tab.
- O escopo é limitado ao dashboard web; não há equivalente na interface legada a ser tratado.
- Não há necessidade de redirecionamento ou aviso de depreciação para usuários que acessavam a
  tab removida — a remoção é direta.
- Renomear "Config" para "Settings" (SET-10b) está fora do escopo desta feature.
