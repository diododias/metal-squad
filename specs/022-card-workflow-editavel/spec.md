# Feature Specification: Card de workflow editável

**Feature Branch**: `feat/set03-card-workflow-editavel`

**Created**: 2026-07-15

**Status**: Draft

**Input**: Feature: SET-03 — Card Workflow editável

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ajustar o workflow de uma feature (Priority: P1)

Como pessoa que configura uma feature, quero editar o modo de execução, a
sincronização de tarefas e a política de aprovações no card de workflow, para
adequar o fluxo da feature sem modificar o backlog manualmente.

**Why this priority**: O workflow determina como a feature avança e recebe
aprovações; torná-lo editável devolve à pessoa usuária o controle necessário
para adaptar uma feature existente.

**Independent Test**: Abrir o detalhe de uma feature, alterar cada opção de
workflow individualmente, salvar e reabrir o detalhe, verificando que os novos
valores são apresentados.

**Acceptance Scenarios**:

1. **Given** uma feature com workflow exibido, **When** a pessoa altera o modo
   de execução para etapas e salva, **Then** o novo modo é apresentado como a
   configuração salva da feature.
2. **Given** uma feature com workflow exibido, **When** a pessoa altera a
   sincronização de tarefas e salva, **Then** essa preferência é preservada sem
   mudar os demais valores de workflow.
3. **Given** uma feature com workflow exibido, **When** a pessoa informa um
   destino de aprovação e altera o avanço automático, **Then** as escolhas
   válidas são salvas e reaparecem ao reabrir o detalhe.

---

### User Story 2 - Corrigir uma configuração de workflow inválida (Priority: P2)

Como pessoa que configura uma feature, quero receber uma orientação clara quando
uma combinação de workflow não é permitida, para corrigi-la antes que ela afete
as próximas execuções.

**Why this priority**: Impedir configurações inconsistentes evita que uma
feature fique com um fluxo que não pode ser executado ou aprovado corretamente.

**Independent Test**: Informar um destino de aprovação inexistente ou outra
combinação inválida, tentar salvar e verificar que o valor anterior continua
intacto com uma mensagem que indica como corrigir o problema.

**Acceptance Scenarios**:

1. **Given** um destino de aprovação que não existe, **When** a pessoa tenta
   salvar o workflow, **Then** o salvamento é recusado e o card informa que um
   destino válido deve ser escolhido.
2. **Given** uma combinação de valores que viola as regras de workflow da
   feature, **When** a pessoa tenta salvar, **Then** nenhuma mudança é gravada
   e a orientação exibida identifica o ajuste necessário.
3. **Given** uma tentativa de salvamento recusada, **When** a pessoa corrige o
   campo indicado e salva novamente, **Then** somente a configuração válida é
   aplicada.

---

### User Story 3 - Preservar o fluxo já configurado (Priority: P2)

Como pessoa que configura uma feature, quero alternar o modo de execução sem
perder as etapas já definidas, para experimentar o fluxo adequado sem precisar
recriar informações existentes.

**Why this priority**: A preservação evita perda acidental de configuração em
uma alteração comum e torna seguro alternar entre os modos disponíveis.

**Independent Test**: Configurar uma feature com etapas, alternar o modo de
execução, salvar e verificar que as etapas e todas as propriedades não editadas
permanecem disponíveis com seus valores anteriores.

**Acceptance Scenarios**:

1. **Given** uma feature que já contém etapas definidas, **When** a pessoa
   alterna entre os modos de execução e salva, **Then** as etapas existentes
   continuam preservadas.
2. **Given** uma pessoa que altera apenas uma opção de workflow, **When** o
   salvamento é concluído, **Then** todas as opções não alteradas mantêm seus
   valores anteriores.
3. **Given** o campo de avanço automático, **When** ele é exibido para edição,
   **Then** o card o identifica como uma configuração legada que permanecerá
   disponível até sua futura unificação.

### Edge Cases

- Um destino de aprovação anteriormente configurado deixa de existir: o card
  deve preservar o valor exibido, recusar um novo salvamento inválido e orientar
  a escolha de um destino válido.
- Alternar entre os modos de execução não pode remover nem alterar as etapas
  previamente definidas.
- Um salvamento recusado não pode substituir o workflow já salvo; os valores
  em edição devem continuar visíveis para correção ou nova tentativa.
- Salvar sem alterações pendentes não pode modificar nenhuma configuração da
  feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O produto DEVE permitir, no card de workflow do detalhe da
  feature, editar o modo de execução, a preferência de sincronização de tarefas,
  o destino de aprovação e o avanço automático de aprovações.
- **FR-002**: O produto DEVE oferecer os dois modos de execução suportados:
  execução única e execução por etapas.
- **FR-003**: Antes de salvar, o produto DEVE verificar toda a configuração de
  workflow segundo as regras de negócio já estabelecidas para workflows da
  feature, incluindo regras que envolvam mais de um campo.
- **FR-004**: Quando a configuração não atender às regras de workflow, o
  produto NÃO DEVE gravar nenhuma alteração e DEVE apresentar uma orientação
  acionável que identifique o ajuste necessário.
- **FR-005**: Ao salvar uma alteração válida, o produto DEVE modificar somente
  os valores de workflow alterados e preservar todos os demais valores da
  feature, inclusive etapas já definidas.
- **FR-006**: O produto DEVE indicar o campo de avanço automático de aprovações
  como legado, sem remover sua possibilidade de edição nesta entrega.
- **FR-007**: O card DEVE adotar o mesmo comportamento de rótulos, edição,
  indicação de alterações e mensagens de retorno usado pelos demais cards de
  configuração da feature.
- **FR-008**: Após um salvamento válido, o detalhe da feature DEVE mostrar os
  valores persistidos como a nova referência para alterações subsequentes.
- **FR-009**: O escopo desta feature limita-se à edição do card de workflow;
  criar ou administrar destinos de aprovação e unificar o avanço automático
  permanecem fora de escopo.

### Key Entities *(include if feature involves data)*

- **Configuração de workflow da feature**: conjunto de preferências que define
  o modo de execução, a sincronização de tarefas e a política de aprovações de
  uma feature.
- **Política de aprovações**: definição do destino que recebe aprovações e da
  preferência de avanço automático após uma aprovação.
- **Etapa de workflow**: atividade já definida na sequência de execução da
  feature, que deve ser preservada quando apenas as preferências do workflow são
  alteradas.
- **Alteração pendente**: diferença entre o valor em edição e a configuração
  salva, que pode ser salva, corrigida ou descartada pela pessoa usuária.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos cenários de aceitação, cada uma das quatro opções de
  workflow pode ser alterada individualmente, salva e confirmada ao reabrir o
  detalhe da feature.
- **SC-002**: Em 100% dos salvamentos que alteram somente uma opção de
  workflow, todas as opções não alteradas e todas as etapas existentes preservam
  seus valores anteriores.
- **SC-003**: Em 100% das tentativas com configuração inválida, nenhuma
  alteração é salva e a pessoa recebe uma orientação de correção antes de poder
  concluir um novo salvamento.
- **SC-004**: Em uma avaliação de tarefas com pessoas que configuram features,
  pelo menos 90% conseguem identificar o campo a corrigir após receber uma
  mensagem de configuração inválida, sem consultar o backlog manualmente.
- **SC-005**: Em 100% dos salvamentos bem-sucedidos, o detalhe mostra os novos
  valores durante a mesma interação, sem exigir atualização manual da página.

## Assumptions

- Pessoas que acessam o detalhe de uma feature já têm permissão para alterar
  suas configurações de workflow.
- Os destinos de aprovação disponíveis são definidos por uma capacidade externa
  ao card; esta entrega apenas permite selecionar e validar a referência usada
  pela feature.
- Os padrões reutilizáveis de edição já entregues pelo SET-01 estão disponíveis
  antes da implementação deste card.
- O avanço automático de aprovações permanecerá editável e claramente marcado
  como legado até que o SET-38 realize sua unificação.
- Uma falha de salvamento mantém os valores em edição visíveis para correção e
  não descarta a configuração anteriormente salva.

## Dependencies

- Depende dos padrões reutilizáveis de edição entregues pelo SET-01.
- A administração de destinos de aprovação é tratada separadamente no SET-40.
- A unificação do avanço automático de aprovações é tratada separadamente no
  SET-38.
