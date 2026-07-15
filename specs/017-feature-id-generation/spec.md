# Feature Specification: Registro de Features com ID Gerado Automaticamente

**Feature Branch**: `feat/f52-feature-id-generation`

**Created**: 2026-07-14

**Status**: Implemented and revised

**Roadmap**: V1 — Marco 1 (Fundação + Quick Wins)

**Input**: User description: "Toda feature carregada via `backlog.yaml` recebe um ID gerado pela plataforma no padrão `F-<short-id-8-digits>`, qualquer ID informado é ignorado e o item é removido do YAML após publicação bem-sucedida."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cadastro em batch com ID autoritativo (Priority: P1)

Como pessoa que mantém o backlog, quero que toda feature carregada receba um
identificador curto e único gerado pela plataforma, independentemente do ID
escrito na fonte, e que a entrada seja consumida após a publicação.

**Why this priority**: Esse é o fluxo atual de cadastro e elimina imediatamente
colisões e alterações acidentais causadas pela manutenção manual de IDs.

**Independent Test**: Adicionar uma feature com qualquer `id`, carregar o
backlog e confirmar que ela recebeu um ID `F-` válido, que o mesmo ID aparece
no catálogo e que a entrada foi removida do YAML.

**Acceptance Scenarios**:

1. **Given** uma feature com ou sem `id`, **When** o usuário carrega o backlog,
   **Then** a feature recebe um novo ID no formato `F-` seguido de oito
   caracteres do alfabeto definido e fica disponível no catálogo.
2. **Given** uma feature publicada com sucesso, **When** a carga termina,
   **Then** a entrada correspondente é removida do `backlog.yaml`.
3. **Given** várias features novas no mesmo carregamento, **When** o usuário
   conclui o cadastro, **Then** cada feature recebe um ID diferente.

### User Story 2 — Reconciliação do catálogo (Priority: P2)

Como plataforma, quero atualizar referências de catálogo, runs, gates e
notificações quando uma feature carregada recebe um novo ID, para que todas as
fontes operacionais usem a identidade gerada.

**Why this priority**: A compatibilidade evita uma migração destrutiva e mantém
operacionais os backlogs que já estão em uso.

**Independent Test**: Carregar uma entrada que já possui um registro no banco,
gerar um novo ID e confirmar que o item e suas referências operacionais usam o
novo valor.

**Acceptance Scenarios**:

1. **Given** uma feature com qualquer ID de origem, **When** o backlog é
   carregado, **Then** o valor de origem não é persistido como identidade.
2. **Given** uma feature já registrada no catálogo, **When** ela é carregada
   novamente, **Then** o registro e suas referências são rekeyeados para o novo
   ID gerado dentro da mesma transação.
3. **Given** uma publicação que falha, **When** a transação é revertida,
   **Then** YAML, catálogo e referências permanecem no estado anterior.

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
- Toda entrada consumida deixa de existir no `backlog.yaml` após o commit.
- A ausência de uma feature na próxima carga não arquiva nem remove o registro
  já publicado no catálogo.
- Dependências e referências operacionais que apontavam para o ID de origem
  são atualizadas para o ID gerado quando a correspondência for conhecida.
- Se o cadastro falhar antes da persistência, nenhuma atribuição parcial pode
  deixar duas fontes de verdade com IDs diferentes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE atribuir a toda feature carregada um identificador
  no formato `F-` seguido de exatamente oito caracteres maiúsculos do alfabeto
  fixo `23456789ABCDEFGHJKMNPQRSTVWXYZ`, ignorando qualquer `id` de origem.
- **FR-002**: O ID atribuído DEVE ser escolhido de forma aleatória e validado
  contra todos os IDs já existentes no escopo global de cadastro antes de ser
  confirmado, garantindo unicidade entre projetos e canais.
- **FR-003**: O sistema DEVE remover do `backlog.yaml` cada feature somente
  depois que seu catálogo for confirmado com sucesso.
- **FR-004**: O ID gerado DEVE ser persistido junto da feature e permanecer
  disponível, sem divergência, para o catálogo, runs, histórico,
  dependências, notificações e board.
- **FR-005**: A atribuição e a persistência do ID DEVEM ser atômicas sob
  concorrência; nenhuma combinação de carregamentos simultâneos pode atribuir
  o mesmo ID a duas features diferentes.
- **FR-006**: IDs presentes no YAML DEVEM ser ignorados para fins de identidade
  e não podem impedir a geração do ID da plataforma.
- **FR-007**: A publicação DEVE atualizar as referências de catálogo, histórico
  de runs, gates, pipelines e notificações para o ID gerado quando houver uma
  correspondência com o item já registrado.
- **FR-008**: A ausência de uma entrada na fila YAML NÃO DEVE arquivar nem
  apagar automaticamente a feature já publicada no catálogo.
- **FR-009**: Deve existir uma única regra de geração reutilizável por qualquer
  canal de cadastro, incluindo o carregamento batch e o futuro cadastro online.
- **FR-010**: O board web DEVE exibir o ID gerado e persistido no catálogo; uma
  identificação derivada no cliente não pode substituir esse valor.
- **FR-011**: O contrato desta feature DEVE abranger apenas o ID de `Feature`;
  o ID de `Epic` permanece fora do escopo e não deve ser alterado por este
  cadastro.

### Key Entities *(include if feature involves data)*

- **Feature**: Unidade de trabalho com `title`, `workflow`, `tasks`,
  `dependsOn` e um ID canônico gerado pela plataforma.
- **ID de Feature**: Identificador persistente usado para localizar a mesma
  feature entre carregamentos, projetos, runs, notificações e visualizações.
- **Catálogo de Features**: Registro compartilhado que mantém a associação
  entre cada feature e seu ID, sem divergência em relação à fonte de cadastro.

## Scope Boundaries

- Inclui a geração, validação, unicidade, persistência e consumo do ID de
  `Feature` no cadastro batch e na preparação do cadastro online.
- Inclui a reconciliação de referências existentes para os IDs gerados.
- Não inclui uma interface online completa; ela reutilizará o mesmo gerador.
- Não inclui a alteração de `EpicSchema.id`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das features carregadas, com ou sem ID de origem, recebem um
  ID `F-<8>` válido antes de ficarem disponíveis para execução ou visualização.
- **SC-002**: 100% das features publicadas com sucesso são removidas do
  `backlog.yaml`, e uma carga posterior vazia preserva o catálogo.
- **SC-003**: Em uma carga de pelo menos 200 features novas, 100% dos IDs são
  válidos e distintos, sem colisões observadas.
- **SC-004**: 100% dos cenários de reconciliação com dependências, runs,
  notificações e IDs de origem atualizam para a feature correta.
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
- IDs informados na fonte não são identidade persistida; o catálogo usa apenas
  IDs gerados pela plataforma.
- O carregamento batch continua sendo o primeiro canal entregue. O cadastro
  online futuro reutilizará o mesmo contrato, mas sua interface e permissões
  pertencem a F57.
- O board é a interface oficial para novas visualizações; a identificação
  exibida deve refletir o registro persistido após a reconciliação.
