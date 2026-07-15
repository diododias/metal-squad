# Feature Specification: Aprovação via Telegram ao atingir timeout

**Feature Branch**: `019-timeout-telegram-approval`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Feature: F55 — Aprovação via Telegram ao atingir timeout"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Receber decisão quando uma execução expira (Priority: P1)

Quando uma execução de uma feature atingir o limite de tempo, o administrador
recebe uma solicitação de decisão no tópico da feature no Telegram, com o
contexto do timeout e uma ação explícita para autorizar uma nova tentativa.

**Why this priority**: Um timeout sem decisão deixa o pipeline parado ou exige
acompanhamento manual fora do canal operacional. A solicitação no Telegram
torna a falha visível e recuperável no momento em que acontece.

**Independent Test**: Simular uma execução que exceda o limite configurado,
confirmar que o run fica aguardando decisão e verificar que uma única mensagem
de aprovação chega ao tópico correto da feature com o identificador, etapa,
tempo excedido e última informação de progresso disponível.

**Acceptance Scenarios**:

1. **Given** uma feature em execução, **When** o limite de tempo for atingido,
   **Then** a execução é marcada como aguardando decisão, o timeout fica
   registrado e o administrador recebe no Telegram uma solicitação de
   aprovação vinculada à feature e à etapa afetadas.
2. **Given** uma solicitação de timeout pendente, **When** o administrador a
   visualizar, **Then** a mensagem informa qual feature e etapa expiraram, o
   tempo aproximado da execução, o motivo do bloqueio e a consequência de
   aprovar uma nova tentativa.
3. **Given** o Telegram estiver configurado com tópicos por feature, **When** a
   solicitação for enviada, **Then** ela aparece exclusivamente no tópico da
   feature que sofreu o timeout.

---

### User Story 2 - Autorizar uma nova tentativa pelo Telegram (Priority: P1)

Como administrador, quero aprovar a recuperação diretamente no Telegram para
que a etapa que expirou seja tentada novamente sem reiniciar manualmente todo o
pipeline.

**Why this priority**: A recuperação é o resultado principal da aprovação. Ela
reduz o tempo de intervenção e preserva o trabalho já concluído nas etapas
anteriores.

**Independent Test**: Criar uma solicitação pendente de timeout, selecionar a
ação de nova tentativa e confirmar que a mesma unidade de trabalho é
reenfileirada, que o pipeline retoma do ponto esperado e que a decisão fica
registrada no histórico.

**Acceptance Scenarios**:

1. **Given** uma solicitação de timeout pendente, **When** o administrador
   selecionar “Retry”, **Then** a solicitação é resolvida como aprovada, uma
   nova tentativa é iniciada para a etapa afetada e o pipeline deixa o estado
   de aguardando decisão.
2. **Given** a nova tentativa foi autorizada, **When** a execução continuar,
   **Then** o histórico informa que ela foi iniciada por aprovação de timeout e
   mantém a referência ao timeout original.
3. **Given** o administrador selecionar “Keep blocked” ou não responder,
   **Then** nenhuma nova tentativa é iniciada automaticamente e a feature
   permanece visivelmente bloqueada até uma ação posterior permitida pelo
   fluxo existente.

---

### User Story 3 - Evitar decisões duplicadas e preservar os fluxos existentes (Priority: P2)

Como administrador, quero que uma decisão tardia, duplicada ou enviada fora do
contexto não altere uma execução diferente, e que gates e notificações que não
foram causados por timeout continuem funcionando como antes.

**Why this priority**: Uma aprovação aplicada duas vezes pode iniciar execuções
concorrentes ou consumir recursos sem intenção. A compatibilidade também é
necessária para adotar a recuperação de timeout sem alterar os demais controles
humanos.

**Independent Test**: Enviar duas respostas para a mesma solicitação, responder
após ela ter sido resolvida e responder em um tópico de outra feature; depois
verificar que somente a primeira decisão válida produz efeito e que os fluxos
normais de gate permanecem inalterados.

**Acceptance Scenarios**:

1. **Given** uma solicitação de timeout já resolvida, **When** outro callback ou
   comando para a mesma solicitação for recebido, **Then** ele é reconhecido
   como tardio ou duplicado e não inicia outra tentativa.
2. **Given** uma resposta recebida em um tópico que não corresponde à feature
   da solicitação, **When** o sistema validar o contexto, **Then** a resposta é
   ignorada e nenhuma feature é alterada por engano.
3. **Given** uma execução termina sem timeout ou atinge um gate de outro tipo,
   **When** a notificação e a resposta forem processadas, **Then** o
   comportamento existente permanece inalterado e nenhuma aprovação de
   timeout é criada.
4. **Given** a entrega da notificação falhar temporariamente, **When** o
   administrador consultar o estado da execução, **Then** o timeout e a
   decisão pendente continuam registrados para diagnóstico e recuperação, sem
   marcar a execução como recuperada indevidamente.

### Edge Cases

- O timeout ocorre quando o processo já terminou com sucesso: o sistema deve
  manter somente o resultado terminal confirmado e não criar uma aprovação
  válida para uma execução concluída.
- O timeout ocorre durante uma etapa que já possui outra solicitação humana
  pendente: as solicitações devem permanecer distinguíveis e nenhuma resposta
  deve resolver a solicitação errada.
- O administrador toca em “Retry” simultaneamente em dois dispositivos: apenas
  uma nova tentativa deve ser criada.
- O administrador responde depois de a feature ser cancelada, pulada ou
  substituída por uma retomada: a resposta tardia não deve reativar o pipeline.
- O contexto de progresso não está disponível ou é muito longo: a mensagem
  deve continuar identificando feature, etapa, timeout e ação, sem expor
  credenciais ou conteúdo sensível.
- O Telegram está indisponível no instante do timeout: o estado pendente deve
  ser preservado e a entrega deve permanecer visível como falha recuperável.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE detectar quando uma execução ultrapassar o limite
  de tempo aplicável e registrar o timeout associado à feature, ao run e à
  etapa afetados.
- **FR-002**: Ao registrar um timeout, o sistema DEVE impedir que a execução
  continue como se estivesse ativa e DEVE colocá-la em estado aguardando uma
  decisão humana.
- **FR-003**: O sistema DEVE criar no máximo uma solicitação de aprovação
  pendente para cada ocorrência de timeout, mesmo quando houver notificações ou
  respostas concorrentes.
- **FR-004**: A solicitação do Telegram DEVE informar, no mínimo, o
  identificador da feature, a etapa afetada, a indicação de timeout, o tempo
  decorrido ou limite atingido e a ação que será executada após a aprovação.
- **FR-005**: A solicitação DEVE oferecer uma ação explícita para autorizar a
  nova tentativa e uma ação para manter a feature bloqueada, sem tratar a
  ausência de resposta como autorização.
- **FR-006**: Ao aprovar a nova tentativa, o sistema DEVE resolver a solicitação
  de forma atômica, registrar a origem da decisão e iniciar no máximo uma nova
  execução da etapa afetada.
- **FR-007**: A nova tentativa DEVE preservar o histórico do timeout e o
  progresso confirmado das etapas anteriores, sem reiniciar silenciosamente o
  pipeline inteiro.
- **FR-008**: Ao manter a feature bloqueada ou enquanto não houver resposta, o
  sistema NÃO DEVE iniciar uma nova tentativa automaticamente e DEVE manter o
  estado consultável pelo administrador.
- **FR-009**: Respostas recebidas depois da resolução, cancelamento ou
  substituição da solicitação DEVEM ser ignoradas sem alterar o pipeline.
- **FR-010**: O sistema DEVE validar a feature, o run, a etapa e o tópico de
  origem antes de aplicar uma resposta, impedindo que uma decisão controle outra
  feature.
- **FR-011**: Falhas de criação, entrega ou processamento da solicitação DEVEM
  permanecer registradas com contexto suficiente para diagnóstico e nova
  tentativa de entrega.
- **FR-012**: Execuções sem timeout, gates existentes, perguntas interativas e
  notificações globais DEVEM manter seu comportamento observável atual.
- **FR-013**: O sistema DEVE evitar que uma falha de entrega ao Telegram marque
  o timeout como aprovado ou como recuperado.

### Key Entities *(include if feature involves data)*

- **Ocorrência de Timeout**: registro de que uma execução ultrapassou seu
  limite, com referências à feature, run, etapa, duração observada, limite e
  último progresso disponível.
- **Solicitação de Aprovação de Timeout**: decisão humana pendente ou resolvida,
  ligada a uma ocorrência de timeout e contendo a resposta, origem, estado e
  momento da resolução.
- **Decisão de Recuperação**: autorização para repetir ou manter bloqueada a
  execução, com resultado aplicado ao pipeline e trilha de auditoria.
- **Feature e Run**: unidade de trabalho e execução concreta que determinam o
  contexto da solicitação e impedem que uma resposta seja aplicada em outro
  fluxo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos cenários de timeout cobertos, o administrador recebe
  uma solicitação vinculada à feature e a execução fica em estado aguardando
  decisão em até 5 segundos após o timeout ser detectado.
- **SC-002**: Em 100% dos cenários de aprovação válidos, uma única ação no
  Telegram inicia uma única nova tentativa da etapa afetada em até 10 segundos
  após a decisão.
- **SC-003**: Em 100% dos testes com callbacks duplicados, tardios ou fora do
  tópico correto, nenhuma execução adicional nem alteração em outra feature é
  produzida.
- **SC-004**: Em 100% dos cenários sem resposta, a execução permanece bloqueada
  e não ocorre nova tentativa automática durante o período de observação.
- **SC-005**: Pelo menos 90% dos administradores de teste conseguem identificar
  a feature, a etapa e a ação de recuperação a partir da mensagem do Telegram
  em até 5 segundos.
- **SC-006**: Os fluxos existentes de gates, perguntas, notificações globais e
  execuções sem timeout mantêm o mesmo resultado observável em 100% dos
  cenários de regressão cobertos.
- **SC-007**: Em 100% dos testes de indisponibilidade do Telegram, a ocorrência
  de timeout permanece consultável e recuperável, sem ser marcada como aprovada
  por engano.

## Assumptions

- “Aprovação” significa autorização explícita para repetir a etapa que atingiu
  timeout; a feature não aprova automaticamente o resultado da execução
  interrompida.
- A ação padrão para manter a feature segura é deixá-la bloqueada; não há
  avanço silencioso nem marcação de sucesso quando o administrador recusa ou
  não responde.
- O limite de tempo aplicável já existe no fluxo de execução e continua sendo
  a fonte para identificar a ocorrência; esta feature trata a decisão posterior
  ao timeout.
- O Telegram já está configurado como canal de notificações e, quando houver
  tópicos por feature, a solicitação seguirá a associação existente da feature.
- O histórico de runs, gates e solicitações humanas existente pode registrar a
  ocorrência, a decisão e a nova tentativa sem exigir que o administrador use
  outro canal.
- A entrega no Telegram pode falhar temporariamente; a persistência do estado e
  a sinalização da falha têm prioridade sobre qualquer fallback que misture
  features.
- O escopo desta versão não inclui alterar os limites de timeout, criar novas
  políticas de retentativa automática ou adicionar novos canais de aprovação.
