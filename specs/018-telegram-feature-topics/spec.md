# Feature Specification: F54 — Tópico de Telegram por Feature

**Feature Branch**: `018-telegram-feature-topics`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Feature: F54 — Telegram: supergroup com um tópico por feature"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organizar cada feature em seu próprio tópico (Priority: P1)

Como administrador do Metal Squad, quero que cada feature executada tenha um tópico próprio dentro do supergrupo do Telegram, para acompanhar notificações, perguntas e aprovações sem misturar o trabalho de features diferentes.

**Why this priority**: A separação por feature é o valor central do pedido e reduz diretamente a ambiguidade operacional em um supergrupo compartilhado.

**Independent Test**: Configurar um supergrupo com tópicos habilitados, executar uma feature e confirmar que seu primeiro evento cria ou seleciona um único tópico identificável pela feature e que os eventos seguintes aparecem nele.

**Acceptance Scenarios**:

1. **Given** um supergrupo configurado e uma feature sem tópico associado, **When** a feature gerar sua primeira notificação, **Then** o sistema criará um tópico identificável pelo identificador e nome da feature e enviará a notificação nesse tópico.
2. **Given** duas features distintas em execução, **When** ambas gerarem notificações, **Then** cada notificação aparecerá somente no tópico associado à sua própria feature.
3. **Given** uma feature já associada a um tópico, **When** ela gerar novas notificações, **Then** o sistema reutilizará esse tópico em vez de criar outro.

---

### User Story 2 - Continuar uma feature no mesmo contexto (Priority: P2)

Como administrador, quero que retomadas, novas tentativas e etapas posteriores da mesma feature continuem no tópico existente, para preservar o histórico e responder no contexto correto.

**Why this priority**: A continuidade torna o tópico útil como registro operacional, evitando fragmentação sempre que uma execução é pausada, falha ou avança de etapa.

**Independent Test**: Executar uma feature em mais de uma etapa, interrompê-la e retomá-la, e então verificar que todas as notificações permanecem no mesmo tópico e que uma resposta feita nele controla a feature correta.

**Acceptance Scenarios**:

1. **Given** uma feature com tópico existente, **When** sua execução for retomada ou repetida, **Then** as novas notificações serão publicadas no mesmo tópico.
2. **Given** uma aprovação ou pergunta pendente de uma feature, **When** o administrador responder no tópico daquela feature, **Then** a resposta será aplicada à solicitação pendente correspondente e não a outra feature.
3. **Given** o processo do Metal Squad for reiniciado, **When** uma feature previamente conhecida gerar uma notificação, **Then** o sistema localizará e reutilizará a associação existente sem criar duplicata.

---

### User Story 3 - Detectar configuração incompatível com segurança (Priority: P2)

Como administrador, quero receber um erro claro quando o destino configurado não for um supergrupo com tópicos habilitados, para corrigir a configuração sem perder notificações nem enviá-las ao contexto errado.

**Why this priority**: Um erro de configuração silencioso pode impedir acompanhamento ou misturar informações operacionais; a falha precisa ser explícita e recuperável.

**Independent Test**: Apontar a configuração para um destino que não suporta tópicos, iniciar uma feature e confirmar que o problema é informado de forma acionável e que nenhuma notificação da feature é enviada silenciosamente ao tópico de outra feature.

**Acceptance Scenarios**:

1. **Given** o destino configurado não é um supergrupo com tópicos habilitados, **When** uma feature precisar publicar sua primeira notificação, **Then** o sistema informará que o destino é incompatível e indicará a correção necessária.
2. **Given** a criação ou recuperação do tópico falhou temporariamente, **When** a feature tentar notificar, **Then** o sistema registrará a falha e a disponibilizará para recuperação, sem redirecionar silenciosamente a mensagem para outra feature.
3. **Given** o tópico associado foi removido ou ficou indisponível, **When** a feature voltar a notificar, **Then** o sistema tratará a associação como inválida e recuperará um tópico identificável para a mesma feature, sem duplicar associações válidas.

---

### User Story 4 - Manter notificações sem feature compatíveis (Priority: P3)

Como administrador, quero que mensagens gerais do sistema e configurações legadas continuem funcionando, para adotar a organização por tópicos sem quebrar notificações que não pertencem a uma feature.

**Why this priority**: A compatibilidade reduz o risco da migração e mantém úteis os avisos operacionais que não possuem uma feature de origem.

**Independent Test**: Enviar uma notificação global e uma notificação vinculada a uma feature no mesmo ambiente e confirmar que a primeira segue o destino geral configurado, enquanto a segunda usa o tópico da feature.

**Acceptance Scenarios**:

1. **Given** uma notificação sem feature de origem, **When** ela for enviada, **Then** permanecerá no destino geral configurado para mensagens legadas ou globais.
2. **Given** uma configuração existente que usa um único tópico geral, **When** o sistema enviar uma notificação global, **Then** o comportamento dessa notificação permanecerá compatível com o anterior.

### Edge Cases

- O nome da feature contém caracteres inadequados, é muito longo ou muda depois da criação do tópico: o tópico mantém um título legível e o identificador estável da feature continua sendo a referência principal.
- Duas execuções tentam criar o tópico da mesma feature simultaneamente: somente uma associação é mantida e nenhuma duplicata é usada para as notificações subsequentes.
- Um tópico é renomeado manualmente pelo administrador: a associação continua válida pelo identificador do tópico, desde que ele permaneça disponível.
- Uma feature antiga já possui notificações, mas ainda não possui associação persistida: a primeira notificação após a adoção cria uma associação sem reclassificar silenciosamente o histórico anterior.
- O supergrupo ou tópico não está acessível no momento do envio: a falha é registrada com contexto suficiente para retomar a entrega, sem descarte silencioso.
- Um administrador responde em um tópico que não corresponde à feature da solicitação: a resposta não deve alterar outra feature nem ser tratada como resposta válida por engano.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE associar cada feature a no máximo um tópico dentro do supergrupo configurado para notificações.
- **FR-002**: O sistema DEVE criar o tópico da feature sob demanda, antes da primeira notificação vinculada à feature, quando ainda não existir uma associação válida.
- **FR-003**: O título inicial do tópico DEVE permitir identificar a feature por seu identificador e nome, respeitando os limites de apresentação do Telegram sem perder o identificador.
- **FR-004**: O sistema DEVE persistir a associação entre feature, supergrupo e tópico para reutilizá-la em novas etapas, tentativas, retomadas e reinícios do processo.
- **FR-005**: O sistema DEVE enviar notificações, perguntas, pedidos de entrada e aprovações vinculados a uma feature exclusivamente para o tópico associado àquela feature.
- **FR-006**: O sistema DEVE manter a associação idempotente quando houver notificações ou tentativas concorrentes para a mesma feature, evitando a criação de tópicos duplicados.
- **FR-007**: O sistema DEVE validar que o destino configurado suporta supergrupo com tópicos e informar uma falha acionável quando essa condição não for atendida.
- **FR-008**: Quando o tópico associado estiver indisponível, o sistema DEVE recuperar ou recriar uma associação para a mesma feature de forma controlada, sem enviar a mensagem para o tópico de outra feature.
- **FR-009**: Respostas, aprovações e entradas recebidas em um tópico DEVEM ser vinculadas à solicitação e à feature correspondentes, rejeitando ou ignorando respostas fora do contexto correto.
- **FR-010**: Notificações sem feature de origem DEVEM continuar usando o destino geral ou o comportamento legado configurado, sem exigir a criação de um tópico de feature.
- **FR-011**: O sistema DEVE registrar falhas de criação, recuperação e entrega com o identificador da feature e informação suficiente para diagnóstico e retomada.
- **FR-012**: A adoção de tópicos por feature NÃO DEVE alterar o conteúdo ou o resultado das aprovações, perguntas e entradas; deve alterar apenas sua organização e roteamento no supergrupo.

### Key Entities

- **Feature**: unidade de trabalho identificada de forma estável, com nome, notificações, etapas e execuções relacionadas.
- **Supergrupo de Notificações**: destino compartilhado do Telegram que permite organizar mensagens em tópicos.
- **Tópico da Feature**: espaço único do supergrupo reservado ao histórico e às interações de uma feature; possui identificador, título, disponibilidade e associação à feature.
- **Associação de Tópico**: vínculo persistido entre uma feature e seu tópico em um supergrupo, usado para roteamento e recuperação após reinícios.
- **Solicitação Interativa**: pergunta, aprovação ou pedido de entrada pendente que deve permanecer ligado à feature e ao tópico de origem.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos cenários de validação com duas ou mais features, cada notificação vinculada é entregue no tópico da própria feature e nenhuma notificação é entregue no tópico de outra feature.
- **SC-002**: Em 100% dos cenários de retomada, repetição e reinício cobertos, uma feature reutiliza o mesmo tópico associado, sem criar uma segunda associação válida.
- **SC-003**: O administrador consegue identificar a feature de origem pelo título do tópico em até 5 segundos em pelo menos 90% dos testes de uso com uma lista de 10 features.
- **SC-004**: Uma feature nova tem seu tópico disponível e recebe a primeira notificação em até 10 segundos após o primeiro evento, em pelo menos 95% das tentativas com destino acessível.
- **SC-005**: Em 100% dos testes com destino incompatível ou tópico indisponível, o administrador recebe uma indicação clara do problema e nenhuma mensagem é silenciosamente redirecionada para outra feature.
- **SC-006**: Notificações globais e configurações legadas continuam funcionando sem alteração observável em 100% dos cenários de regressão cobertos.
- **SC-007**: Pelo menos 90% dos administradores de teste conseguem responder a uma solicitação interativa no tópico correto sem consultar outro canal ou histórico externo.

## Assumptions

- O ambiente possui um único supergrupo principal configurado para as notificações do Metal Squad; suporte a múltiplos supergrupos por feature fica fora do escopo desta versão.
- O supergrupo está autorizado a criar e publicar em tópicos, e o bot mantém as permissões necessárias para isso.
- A identidade estável da feature já existe no fluxo do produto e pode ser usada para diferenciar features com nomes semelhantes.
- Uma feature mantém seu tópico ao longo de todas as etapas, tentativas e retomadas; o tópico não é recriado apenas porque o nome da feature mudou.
- Mensagens sem feature de origem continuam usando o destino geral configurado; não serão artificialmente atribuídas a uma feature.
- O canal de resposta por texto, aprovação e entrada já existente permanece disponível; esta feature organiza o contexto, mas não redefine seus contratos de conteúdo.
- Quando não for possível criar ou recuperar um tópico, a prioridade é preservar o isolamento entre features e tornar a falha recuperável, mesmo que a entrega precise aguardar correção da configuração ou do acesso.

