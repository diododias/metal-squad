# Feature Specification: Registro de Features com ID Gerado Automaticamente

**Feature Branch**: `feat/f52-feature-id-generation`

**Created**: 2026-07-14

**Status**: Draft

**Roadmap**: V1 — Marco 1 (Fundação + Quick Wins)

**Input**: User description: "Registro de Features com novo ID — features cadastradas via `backlog.yaml` (batch) ou futuramente online recebem um ID gerado automaticamente no padrão `F-<short-id-8-digits>`, substituindo o padrão `feat-N`."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cadastro em batch sem ID (Priority: P1)

Como pessoa que mantém o backlog, quero que uma feature nova sem ID explícito
receba automaticamente um identificador curto, único e permanente quando o
backlog for carregado, para não precisar inventar números sequenciais.

**Why this priority**: Esse é o fluxo atual de cadastro e elimina imediatamente
colisões e alterações acidentais causadas pela manutenção manual de IDs.

**Independent Test**: Adicionar uma feature sem `id`, carregar o backlog e
confirmar que ela recebeu um ID `F-` válido, que o mesmo ID aparece nas
consultas subsequentes e que uma segunda carga não altera o valor.

**Acceptance Scenarios**:

1. **Given** uma feature nova sem `id`, **When** o usuário carrega o backlog,
   **Then** a feature recebe um ID no formato `F-` seguido de oito caracteres
   do alfabeto definido e o ID fica disponível para runs, notificações e board.
2. **Given** uma feature que já recebeu um ID, **When** o usuário carrega o
   mesmo backlog novamente, **Then** o ID permanece exatamente igual e nenhum
   novo ID é atribuído àquela feature.
3. **Given** várias features novas no mesmo carregamento, **When** o usuário
   conclui o cadastro, **Then** cada feature recebe um ID diferente.

### User Story 2 — Compatibilidade com IDs existentes (Priority: P2)

Como pessoa que já possui um backlog, quero continuar usando IDs legados ou
manuais válidos sem que o sistema os substitua, para migrar gradualmente sem
quebrar dependências, histórico de runs ou notificações.

**Why this priority**: A compatibilidade evita uma migração destrutiva e mantém
operacionais os backlogs que já estão em uso.

**Independent Test**: Carregar um backlog contendo IDs `feat-N`, IDs manuais
válidos e features sem ID; confirmar que os dois primeiros permanecem iguais,
que a terceira recebe `F-`, e que dependências e histórico continuam
resolvendo-se pelos respectivos IDs.

**Acceptance Scenarios**:

1. **Given** uma feature com ID legado ou manual válido, **When** o backlog é
   carregado, **Then** o ID informado é preservado sem normalização destrutiva.
2. **Given** uma feature sem ID que depende de uma feature existente,
   **When** o backlog é carregado, **Then** a dependência é resolvida sem
   depender do formato dos IDs envolvidos.
3. **Given** um ID manual vazio, com espaços, com caracteres inválidos ou que
   use `F-` fora do formato canônico, **When** o cadastro é validado, **Then**
   o usuário recebe um erro acionável e a feature não é persistida com esse ID.

### User Story 3 — Fonte única para cadastro online futuro (Priority: P3)

Como plataforma que futuramente permitirá cadastrar features pela interface
web, quero que o cadastro online use a mesma regra de geração do batch, para
que IDs criados em qualquer canal sejam indistinguíveis e não colidam.

**Why this priority**: O fluxo online depende do contrato de ID, mas pode ser
entregue depois do cadastro batch sem bloquear o valor imediato da feature.

**Independent Test**: Exercitar a função de cadastro compartilhada com uma
feature criada fora do carregamento batch e confirmar que ela recebe o mesmo
formato, as mesmas regras de unicidade e a mesma persistência estável.

**Acceptance Scenarios**:

1. **Given** um cadastro futuro sem ID explícito, **When** ele solicita um novo
   ID, **Then** recebe um ID `F-` gerado pela mesma regra usada no batch.
2. **Given** que o board recebe uma feature com ID persistido, **When** a
   feature é exibida, **Then** o board mostra o ID persistido em vez de um hash
   derivado no cliente.

### Edge Cases

- Se um ID recém-gerado coincidir com qualquer ID já existente no catálogo ou
  em um backlog considerado no cadastro, a tentativa não é persistida e outro
  ID é escolhido.
- Dois carregamentos simultâneos não podem atribuir o mesmo ID a features
  diferentes; cada feature deve terminar com um único ID persistido.
- A alteração de `title`, `specFile` ou da posição da feature no backlog não
  pode mudar o ID já atribuído.
- Um backlog que mistura IDs `feat-N`, IDs manuais e IDs `F-<8>` deve ser
  carregado sem reatribuição nem erro causado apenas pelo formato do ID.
- Se o board receber dados legados sem ID persistido, pode usar uma
  identificação derivada apenas como fallback de exibição; esse fallback não
  pode ser tratado como o ID da feature nem ser persistido como substituto.
- Se o cadastro falhar antes da persistência, nenhuma atribuição parcial pode
  deixar duas fontes de verdade com IDs diferentes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE atribuir, no primeiro cadastro de uma feature sem
  `id`, um identificador no formato `F-` seguido de exatamente oito caracteres
  maiúsculos do alfabeto fixo `23456789ABCDEFGHJKMNPQRSTVWXYZ`.
- **FR-002**: O ID atribuído DEVE ser escolhido de forma aleatória e validado
  contra todos os IDs já existentes no escopo global de cadastro antes de ser
  confirmado, garantindo unicidade entre projetos e canais.
- **FR-003**: O sistema DEVE preservar o ID já atribuído quando o backlog for
  recarregado, independentemente de reordenação, alteração de título ou
  alteração de arquivo de especificação.
- **FR-004**: O ID gerado DEVE ser persistido junto da feature e permanecer
  disponível, sem divergência, para o catálogo, runs, histórico,
  dependências, notificações e board.
- **FR-005**: A atribuição e a persistência do ID DEVEM ser atômicas sob
  concorrência; nenhuma combinação de carregamentos simultâneos pode atribuir
  o mesmo ID a duas features diferentes.
- **FR-006**: IDs legados no padrão `feat-N` e IDs manuais válidos DEVEM ser
  aceitos e preservados. IDs manuais DEVEM ser não vazios, não conter espaços
  ou caracteres de controle e não usar o prefixo reservado `F-` fora do formato
  canônico de oito caracteres.
- **FR-007**: O sistema DEVE rejeitar IDs manuais duplicados ou malformados no
  ponto de entrada, informando o problema sem sobrescrever outra feature.
- **FR-008**: A resolução de `dependsOn`, o histórico de runs e as notificações
  DEVEM funcionar da mesma forma para IDs `F-<8>`, `feat-N` e IDs manuais
  válidos; a ordenação não pode depender do formato do ID.
- **FR-009**: Deve existir uma única regra de geração reutilizável por qualquer
  canal de cadastro, incluindo o carregamento batch e o futuro cadastro online.
- **FR-010**: O board web DEVE exibir o ID persistido quando ele existir. Uma
  identificação derivada no cliente só pode ser usada como fallback para dados
  legados sem ID persistido e não pode substituir o valor persistido.
- **FR-011**: O contrato desta feature DEVE abranger apenas o ID de `Feature`;
  o ID de `Epic` permanece fora do escopo e não deve ser alterado por este
  cadastro.

### Key Entities *(include if feature involves data)*

- **Feature**: Unidade de trabalho com `title`, `workflow`, `tasks`,
  `dependsOn` e um ID estável; features novas recebem um ID canônico quando o
  usuário não informa um.
- **ID de Feature**: Identificador persistente usado para localizar a mesma
  feature entre carregamentos, projetos, runs, notificações e visualizações.
- **Catálogo de Features**: Registro compartilhado que mantém a associação
  entre cada feature e seu ID, sem divergência em relação à fonte de cadastro.

## Scope Boundaries

- Inclui a geração, validação, unicidade, persistência e consumo do ID de
  `Feature` no cadastro batch e na preparação do cadastro online.
- Inclui a compatibilidade de leitura e uso de IDs legados e manuais válidos.
- Não inclui o cadastro online completo da UI, previsto para F57.
- Não inclui a migração obrigatória de todos os IDs legados para `F-<8>`.
- Não inclui a alteração de `EpicSchema.id`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das features novas sem ID carregadas no batch recebem um ID
  `F-<8>` válido antes de ficarem disponíveis para execução ou visualização.
- **SC-002**: Duas cargas consecutivas do mesmo backlog produzem zero mudanças
  nos IDs já atribuídos.
- **SC-003**: Em uma carga de pelo menos 200 features novas, 100% dos IDs são
  válidos e distintos, sem colisões observadas.
- **SC-004**: 100% dos cenários de regressão com dependências, runs,
  notificações e IDs legados continuam resolvendo a feature correta.
- **SC-005**: 100% das features que possuem ID persistido são exibidas no board
  com esse mesmo ID, sem usar o hash client-side como valor principal.
- **SC-006**: Em testes de cadastro concorrente, nenhuma feature recebe um ID
  já confirmado para outra feature e nenhuma fonte de cadastro fica com IDs
  divergentes após uma atribuição concluída.

## Assumptions

- O alfabeto canônico adotado nesta especificação é o conjunto maiúsculo sem
  caracteres ambíguos `0`, `1`, `I`, `L`, `O` e `U`, representado por
  `23456789ABCDEFGHJKMNPQRSTVWXYZ`; a decisão final deve ser confirmada no
  plano sem alterar o requisito de oito caracteres.
- A unicidade global pressupõe que o catálogo compartilhado consiga consultar
  os IDs registrados fora do projeto atual; quando essa consulta não estiver
  disponível, o cadastro deve falhar de forma explícita em vez de afirmar
  unicidade apenas local.
- IDs legados e manuais já existentes serão preservados durante a migração;
  somente novas features sem ID receberão automaticamente o formato canônico.
- O carregamento batch continua sendo o primeiro canal entregue. O cadastro
  online futuro reutilizará o mesmo contrato, mas sua interface e permissões
  pertencem a F57.
- O board é a interface oficial para novas visualizações; a identificação
  exibida deve refletir o registro persistido, inclusive durante a transição de
  dados legados.
