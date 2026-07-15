# Feature Specification: Primitivos de edição reutilizáveis

**Feature Branch**: `feat/set01-primitivos-edicao`

**Created**: 2026-07-14

**Status**: Draft

**Input**: Feature: SET-01 — Primitivos de edição reutilizáveis

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reutilizar controles de edição consistentes (Priority: P1)

Como pessoa desenvolvedora que monta cartões editáveis de uma feature, quero
usar controles reutilizáveis para texto, seleção e ativação/desativação, para
entregar edição consistente sem recriar rótulo, campo e indicação de alteração
em cada cartão.

**Why this priority**: Os cartões editáveis dependem desses controles para
restaurar uma experiência de edição coerente. Sem eles, cada cartão repete a
mesma interação e pode divergir visual ou funcionalmente.

**Independent Test**: Em uma tela de demonstração isolada, apresentar os três
tipos de controle com um valor inicial, alterar cada um e confirmar que o
cartão que os utiliza recebe o novo valor e identifica a alteração pendente.

**Acceptance Scenarios**:

1. **Given** um cartão fornece um rótulo, valor inicial e valor atual de um
   campo textual, **When** a pessoa altera o texto, **Then** o cartão recebe o
   novo valor e o controle passa a indicar que há uma alteração pendente.
2. **Given** um cartão fornece opções e o valor atual de uma seleção, **When**
   a pessoa escolhe uma opção diferente, **Then** o cartão recebe a opção
   escolhida e o controle indica que há uma alteração pendente.
3. **Given** um cartão fornece o estado atual de uma configuração booleana,
   **When** a pessoa a ativa ou desativa, **Then** o cartão recebe o novo
   estado e o controle indica que há uma alteração pendente.

---

### User Story 2 - Reconhecer o estado de uma edição (Priority: P1)

Como pessoa que configura uma feature, quero distinguir campos alterados dos
campos que ainda correspondem à configuração salva, para saber o que será
afetado antes de salvar o cartão.

**Why this priority**: A indicação de alteração reduz o risco de perder ou
confundir mudanças locais durante a configuração de uma feature.

**Independent Test**: Exibir cada tipo de controle com valor inicial e atual
iguais, alterar o valor e depois restaurá-lo, verificando que a indicação de
alteração aparece somente enquanto os valores forem diferentes.

**Acceptance Scenarios**:

1. **Given** um valor atual igual ao valor inicial, **When** o controle for
   exibido, **Then** ele não indica alteração pendente.
2. **Given** um valor atual diferente do valor inicial, **When** o controle for
   exibido, **Then** ele indica alteração pendente sem exigir que o cartão
   mantenha uma marcação duplicada.
3. **Given** um valor alterado, **When** a pessoa o restaura ao valor inicial,
   **Then** a indicação de alteração pendente desaparece.

---

### User Story 3 - Lidar com campos indisponíveis ou sem valor (Priority: P2)

Como pessoa que consulta ou edita uma feature, quero que campos sem valor ou
não editáveis permaneçam claros e estáveis, para entender a configuração sem
encontrar controles quebrados ou ambíguos.

**Why this priority**: Configurações incompletas e permissões de edição são
situações comuns; uma apresentação previsível evita erros ao administrar uma
feature.

**Independent Test**: Exibir cada controle sem valor aplicável e em modo não
editável, confirmando que o rótulo continua legível, a orientação de valor
ausente é mostrada quando necessária e nenhuma alteração é aceita.

**Acceptance Scenarios**:

1. **Given** um campo textual ou seleção sem valor disponível, **When** o
   cartão for exibido, **Then** o controle mostra uma orientação de valor
   ausente sem interromper a tela.
2. **Given** um campo marcado como não editável, **When** a pessoa tentar
   alterá-lo, **Then** o valor permanece inalterado e o rótulo continua
   legível.
3. **Given** um controle não editável com valor diferente do inicial, **When**
   ele for exibido, **Then** a indicação de alteração permanece visível para
   comunicar o estado do valor, sem permitir nova edição.

### Edge Cases

- Um valor textual vazio, uma seleção sem opção disponível ou um valor
  indefinido não podem quebrar a apresentação do cartão.
- A opção previamente escolhida deixa de estar disponível: o cartão deve
  preservar a informação recebida e apresentar uma situação compreensível até
  que uma nova opção válida seja escolhida.
- O cartão atualiza o valor inicial após salvar: a indicação de alteração deve
  refletir imediatamente a nova referência salva.
- Uma alteração é revertida antes de salvar: o campo deve voltar a ser tratado
  como não alterado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O produto DEVE disponibilizar três controles de edição
  reutilizáveis: um para texto, um para escolha entre opções e um para estado
  ativado/desativado.
- **FR-002**: Cada controle DEVE exibir, de forma associada, um rótulo legível
  e seu respectivo campo de edição.
- **FR-003**: Cada controle DEVE receber do cartão que o utiliza tanto o valor
  exibido quanto as alterações solicitadas; ele não DEVE assumir ou persistir
  por conta própria a configuração da feature.
- **FR-004**: Cada controle DEVE determinar se existe alteração pendente pela
  comparação entre o valor atual e a referência inicial fornecida pelo cartão.
- **FR-005**: Cada controle DEVE comunicar visualmente a alteração pendente
  quando os valores forem diferentes e removê-la quando voltarem a ser iguais.
- **FR-006**: Os controles DEVEM oferecer estado não editável, impedindo
  alterações e preservando a legibilidade do rótulo e do valor.
- **FR-007**: Os controles DEVEM tratar valores ausentes ou vazios com uma
  apresentação estável e compreensível.
- **FR-008**: Os controles DEVEM seguir o padrão de apresentação da edição de
  orientação de etapas já disponível, preservando a consistência dos cartões
  existentes.
- **FR-009**: Os controles NÃO DEVEM realizar comunicação externa, acesso a
  dados persistidos ou alteração de arquivos; sua responsabilidade limita-se à
  apresentação e à comunicação da interação ao cartão que os utiliza.
- **FR-010**: Esta feature DEVE se limitar aos controles reutilizáveis; a
  reconstrução dos cartões editáveis de configuração permanece fora de escopo
  e será tratada pelas features SET-02 a SET-06.

### Key Entities *(include if feature involves data)*

- **Controle de edição reutilizável**: elemento de apresentação para editar um
  único valor, composto por rótulo, campo, valor inicial, valor atual, estado
  de edição e indicação de alteração.
- **Cartão editável**: contexto que fornece valores e recebe alterações dos
  controles, mantendo a responsabilidade pela configuração e pelo salvamento.
- **Referência inicial**: valor usado para comparar a edição atual e comunicar
  se uma alteração ainda está pendente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos cenários de demonstração dos três tipos de controle,
  alterar o campo comunica o novo valor ao cartão que o utiliza.
- **SC-002**: Em 100% dos cenários com valor atual diferente da referência
  inicial, a indicação de alteração é exibida; em 100% dos cenários com valores
  iguais, ela não é exibida.
- **SC-003**: Em 100% dos cenários com campos não editáveis, nenhuma tentativa
  de alteração modifica o valor fornecido pelo cartão e o rótulo permanece
  legível.
- **SC-004**: Em 100% dos cenários com valores vazios ou ausentes, o cartão
  continua utilizável e apresenta orientação compreensível em vez de falhar.
- **SC-005**: Os cinco cartões editáveis previstos nas features SET-02 a SET-06
  podem adotar os três controles sem recriar o comportamento de rótulo e
  identificação de alteração.
- **SC-006**: Os cartões existentes que seguem o padrão de edição de orientação
  de etapas mantêm o mesmo resultado visual e de interação nos cenários de
  regressão cobertos.

## Assumptions

- O padrão visual e de interação da edição de orientação de etapas existente é
  a referência aprovada para os novos controles.
- A forma exata da indicação visual de alteração pode ser definida no
  planejamento, desde que seja consistente, perceptível e siga todos os
  requisitos desta especificação.
- O cartão consumidor é a fonte de verdade para o valor atual, a referência
  inicial, disponibilidade de edição e eventual salvamento.
- A feature não altera regras de configuração, permissões, salvamento ou
  comunicação de dados; ela apenas prepara os controles necessários para as
  features SET-02 a SET-06.

## Dependencies

- Não depende de outra feature do marco Settings; é a primeira entrega do M1.
- Habilita SET-02, SET-03, SET-04, SET-05 e SET-06, que restaurarão os cartões
  editáveis de configuração.
