# Feature Specification: Card de execução editável

**Feature Branch**: `feat/set02-card-execucao-editavel`

**Created**: 2026-07-15

**Status**: Draft

**Input**: Feature: SET-02 — Card Execução editável

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ajustar a execução de uma feature (Priority: P1)

Como pessoa que configura uma feature, quero editar no detalhe os parâmetros de
execução — ferramenta, modelo, nível de esforço, limite de tokens e início
automático — para adequar a próxima execução sem modificar o backlog
manualmente.

**Why this priority**: A edição desses parâmetros é a finalidade central do
card e devolve autonomia para ajustar uma feature já cadastrada.

**Independent Test**: Abrir o detalhe de uma feature, alterar individualmente
cada um dos cinco parâmetros e salvar, verificando que o detalhe mostra os
valores salvos durante a mesma interação.

**Acceptance Scenarios**:

1. **Given** uma feature com parâmetros de execução exibidos, **When** a pessoa
   altera um ou mais parâmetros válidos e salva, **Then** a configuração da
   feature passa a exibir os novos valores sem exigir atualização manual da
   página.
2. **Given** uma feature configurada, **When** a pessoa altera somente o nível
   de esforço e salva, **Then** os demais parâmetros de execução mantêm seus
   valores anteriores.
3. **Given** uma feature exibida, **When** a pessoa alterna o início automático
   e salva, **Then** o estado salvo corresponde à escolha feita.

---

### User Story 2 - Revisar alterações antes de salvar (Priority: P1)

Como pessoa que configura uma feature, quero identificar quais parâmetros de
execução foram modificados antes de salvar, para ter segurança sobre o que será
alterado.

**Why this priority**: A percepção clara de mudanças pendentes reduz o risco de
salvar uma configuração inesperada e mantém a edição consistente com os demais
cards de configuração.

**Independent Test**: Alterar um parâmetro, confirmar que ele é indicado como
pendente, restaurar o valor original e confirmar que a indicação desaparece sem
salvar.

**Acceptance Scenarios**:

1. **Given** parâmetros ainda iguais aos valores salvos, **When** o card é
   aberto, **Then** nenhum parâmetro é indicado como alteração pendente.
2. **Given** um parâmetro alterado, **When** a pessoa o restaura ao valor salvo,
   **Then** ele deixa de ser indicado como pendente e não há alteração a salvar.
3. **Given** nenhum parâmetro pendente, **When** a pessoa tenta salvar, **Then**
   nenhuma configuração é alterada.

---

### User Story 3 - Corrigir dados de execução inválidos (Priority: P2)

Como pessoa que configura uma feature, quero receber orientação clara ao inserir
um limite de tokens inválido ou escolher uma ferramenta indisponível, para
corrigir a configuração antes de salvá-la.

**Why this priority**: A validação evita que uma configuração inválida seja
salva e torne a execução da feature imprevisível.

**Independent Test**: Informar um limite negativo ou não numérico e tentar
salvar; repetir com uma ferramenta indisponível e confirmar que ambos os casos
são bloqueados com uma orientação acionável.

**Acceptance Scenarios**:

1. **Given** um limite de tokens negativo ou que não representa um número,
   **When** a pessoa tenta salvar, **Then** o salvamento é impedido e o card
   informa como corrigir o valor.
2. **Given** uma ferramenta que não está disponível para a feature, **When** a
   pessoa tenta selecioná-la ou salvar essa escolha, **Then** a configuração
   inválida não é aceita e a pessoa recebe uma orientação compreensível.

### Edge Cases

- Salvar sem alterações pendentes não pode mudar a configuração da feature.
- A ferramenta anteriormente salva deixa de estar disponível: o card deve
  preservar a informação exibida e impedir que uma nova configuração inválida
  seja salva até que uma opção válida seja escolhida.
- Um limite de tokens vazio, negativo ou não numérico deve manter os demais
  valores inalterados e apresentar uma orientação acionável.
- Se o salvamento não puder ser concluído, os valores ainda pendentes devem
  permanecer visíveis para que a pessoa possa corrigir ou tentar novamente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O produto DEVE permitir, no card de execução do detalhe da
  feature, editar a ferramenta, o modelo, o nível de esforço, o limite de
  tokens e o início automático.
- **FR-002**: O produto DEVE apresentar as ferramentas disponíveis como opções
  de escolha e impedir que uma ferramenta indisponível seja aceita como nova
  configuração.
- **FR-003**: O produto DEVE identificar visualmente cada parâmetro de execução
  cujo valor difere do valor salvo e remover essa identificação quando o valor
  for restaurado.
- **FR-004**: Ao salvar, o produto DEVE alterar somente os parâmetros de
  execução que tenham sido modificados; todos os outros valores da feature
  DEVEM permanecer preservados.
- **FR-005**: O produto DEVE rejeitar um limite de tokens vazio, negativo ou
  não numérico e informar uma forma acionável de corrigi-lo antes do
  salvamento.
- **FR-006**: Quando não houver alterações pendentes, o produto NÃO DEVE alterar
  a configuração da feature ao receber uma solicitação de salvamento.
- **FR-007**: Após um salvamento bem-sucedido, o detalhe da feature DEVE mostrar
  imediatamente os valores salvos e tratá-los como a nova referência para
  alterações posteriores.
- **FR-008**: O card DEVE usar os controles reutilizáveis de edição já definidos
  para que rótulos, edição e indicação de alterações mantenham comportamento
  consistente com os demais cards de configuração.
- **FR-009**: O escopo desta feature limita-se ao card de execução; mudanças no
  catálogo de ferramentas e nos demais cards de configuração permanecem fora
  de escopo.

### Key Entities *(include if feature involves data)*

- **Configuração de execução da feature**: conjunto de valores que determina a
  ferramenta, modelo, nível de esforço, limite de tokens e início automático
  de uma feature.
- **Alteração pendente**: diferença entre um parâmetro atualmente editado e sua
  referência salva, que pode ser salva ou revertida pela pessoa usuária.
- **Ferramenta disponível**: opção de execução que pode ser escolhida para uma
  feature no momento da edição.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos cenários de aceitação, cada um dos cinco parâmetros
  de execução pode ser alterado e salvo individualmente.
- **SC-002**: Em 100% dos salvamentos que modificam somente um parâmetro, todos
  os demais parâmetros de execução preservam o valor anterior.
- **SC-003**: Em 100% dos salvamentos bem-sucedidos, o detalhe mostra os novos
  valores na mesma interação, sem atualização manual da página.
- **SC-004**: Em 100% das tentativas com limite de tokens vazio, negativo ou não
  numérico, a configuração inválida não é salva e uma orientação de correção é
  apresentada.
- **SC-005**: Em 100% dos cenários sem alterações pendentes, uma tentativa de
  salvamento não altera nenhum valor da configuração da feature.

## Assumptions

- Pessoas que acessam o detalhe de uma feature já têm permissão para ajustar
  sua configuração de execução.
- As opções de ferramenta disponíveis no card seguem a lista atualmente aceita
  pelo produto; a migração dessa lista para um registro mais amplo é trabalho
  posterior e não altera este escopo.
- Os controles reutilizáveis de edição do SET-01 estão disponíveis para adoção
  pelo card antes da implementação desta feature.
- Falhas de salvamento usam a orientação de erro já adotada pelo produto e não
  descartam automaticamente valores ainda não salvos.

## Dependencies

- Depende dos controles reutilizáveis de edição entregues pelo SET-01.
- A evolução do catálogo de ferramentas é tratada separadamente no SET-30 e não
  faz parte desta feature.
