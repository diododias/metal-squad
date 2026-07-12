# Feature Specification: Perguntas Interativas via Telegram (Botoes)

**Feature Branch**: `012-telegram-interactive-questions`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "F47 — Perguntas Interativas via Telegram (Botoes): quando a IA levanta uma pergunta de esclarecimento durante um step (ex. specify), a notificacao no Telegram deve apresentar as opcoes de resposta como botoes (inline keyboard) usando o mesmo conteudo de pergunta/opcoes que a IA gerou, em vez de exigir resposta livre por texto ou tratar a pergunta como um pedido generico de aprovacao de gate. Depende de H19 (deteccao correta de pergunta vs aprovacao + truncamento de mensagens Telegram)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Responder pergunta da IA com um toque (Priority: P1)

Durante um step em execucao (ex. `specify`), a IA levanta uma pergunta de esclarecimento com opcoes de resposta. O administrador recebe essa pergunta no Telegram como uma mensagem com botoes, um por opcao real apresentada pela IA, e responde tocando no botao desejado em vez de digitar texto livre.

**Why this priority**: E o valor central do pedido do usuario — reduzir o atrito e a ambiguidade de responder perguntas de esclarecimento pelo Telegram. Sem isso, o restante da feature nao tem propósito.

**Independent Test**: Disparar um step que gere uma pergunta real da IA (ex. `specify` com descricao ambigua), confirmar que a notificacao Telegram chega com botoes cujos textos correspondem as opcoes da IA, tocar em um botao e confirmar que o step recebe essa escolha e continua exatamente como continuaria com a resposta livre equivalente digitada hoje.

**Acceptance Scenarios**:

1. **Given** um step em execucao gerou uma pergunta de esclarecimento com opcoes A/B/C, **When** a notificacao chega no Telegram, **Then** a mensagem exibe o texto da pergunta e um botao por opcao, com o rotulo de cada botao igual ao texto da opcao gerada pela IA (nao "aprovar"/"rejeitar").
2. **Given** a mensagem de pergunta com botoes foi entregue, **When** o administrador toca em um dos botoes, **Then** o valor da opcao escolhida e propagado ao step em execucao com o mesmo efeito observavel (avanco do pipeline, conteudo usado pela IA) que a resposta livre por texto equivalente teria hoje.
3. **Given** o administrador respondeu tocando em um botao, **When** o step continua, **Then** o historico/observabilidade do run registra a resposta da mesma forma que registraria uma resposta digitada (mesma trilha de auditoria).

---

### User Story 2 - Aprovacao de gate continua funcionando sem regressao (Priority: P2)

Um pedido de aprovacao de gate (avancar/nao avancar um step, sem relacao com pergunta de esclarecimento da IA) chega ao Telegram e se comporta exatamente como hoje, sem ser afetado pela introducao dos botoes de pergunta.

**Why this priority**: F47 depende de H19 corrigir a deteccao pergunta-vs-aprovacao; garantir que o fluxo de aprovacao nao regride e a condicao de seguranca para essa dependencia nao se tornar uma regressao dupla.

**Independent Test**: Disparar um gate de aprovacao (sem pergunta da IA envolvida), confirmar que a notificacao no Telegram continua no formato de aprovacao atual (aprovar/rejeitar) e que a decisao do administrador tem o mesmo efeito de hoje.

**Acceptance Scenarios**:

1. **Given** um step atinge um gate de aprovacao sem pergunta de esclarecimento da IA, **When** a notificacao Telegram e enviada, **Then** ela mantem o formato de aprovacao atual, sem opcoes inventadas de uma suposta "pergunta".
2. **Given** um administrador aprova ou rejeita um gate pelo Telegram, **When** a decisao e processada, **Then** o comportamento observavel do pipeline e identico ao existente antes desta feature.

---

### User Story 3 - Pergunta longa respeita o limite de mensagem do Telegram (Priority: P3)

Quando o texto da pergunta gerada pela IA (antes dos botoes) ultrapassa o limite de caracteres de uma mensagem do Telegram, o sistema entrega o conteudo de forma legivel (dividido em mensagens sequenciais), com os botoes de resposta anexados na ultima parte, em vez de truncar silenciosamente.

**Why this priority**: Trata o problema secundario de H19 (mensagens truncadas) no contexto especifico da nova UI de botoes, para nao reintroduzir o mesmo defeito com uma cara nova.

**Independent Test**: Gerar (ou simular) uma pergunta da IA cujo texto exceda o limite de mensagem do Telegram, disparar a notificacao e confirmar que o texto completo chega ao administrador (em multiplas mensagens, se necessario) e que os botoes aparecem associados a pergunta, funcionais.

**Acceptance Scenarios**:

1. **Given** o texto da pergunta excede o limite de caracteres de uma mensagem do Telegram, **When** a notificacao e montada, **Then** o texto e dividido em mensagens sequenciais legiveis, sem cortar conteudo sem indicacao.
2. **Given** a pergunta foi dividida em multiplas mensagens, **When** o administrador quer responder, **Then** os botoes de opcoes estao presentes e funcionais na mensagem final da sequencia.

---

### Edge Cases

- O que acontece quando o output da IA nao produz uma estrutura de pergunta+opcoes parseavel (texto livre sem opcoes discretas)? O sistema deve cair de volta para o comportamento atual de resposta livre por texto, em vez de falhar ou omitir a pergunta.
- O que acontece quando a IA apresenta mais opcoes do que o limite pratico/da API do Telegram para botoes inline? O sistema deve usar o mesmo fallback de texto livre.
- O que acontece se o administrador tocar em um botao apos a pergunta ja ter sido respondida (por outro toque ou por resposta de texto concorrente) ou apos o step ja ter expirado/cancelado? O sistema deve ignorar o toque tardio sem corromper o estado do step ou de perguntas subsequentes.
- O que acontece se o rotulo de uma opcao individual exceder o limite de tamanho de um botao/callback do Telegram? O sistema deve tratar isso (abreviar rotulo mantendo identificacao inequivoca da opcao, ou cair para texto livre) em vez de falhar o envio da notificacao inteira.
- Como o sistema distingue, de forma confiavel, uma notificacao de pergunta de uma notificacao de aprovacao de gate? Esta distincao e responsabilidade de H19 e e tratada aqui como uma dependencia resolvida, nao como escopo desta feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE usar o sinal de deteccao "pergunta vs aprovacao de gate" (resolvido por H19) para decidir, antes de montar a notificacao, se um step gerou uma pergunta genuina da IA ou um pedido de aprovacao de gate.
- **FR-002**: Quando uma pergunta genuina for detectada, o sistema DEVE extrair do output da IA o texto da pergunta e a lista de opcoes de resposta discretas apresentadas pela IA.
- **FR-003**: O sistema DEVE enviar a pergunta ao Telegram com um botao (inline keyboard) por opcao extraida, com o rotulo do botao correspondendo ao conteudo real da opcao gerada pela IA — nunca um par generico "aprovar"/"rejeitar" para perguntas.
- **FR-004**: Quando o administrador tocar em um botao de opcao, o sistema DEVE propagar o valor da opcao escolhida de volta ao step em execucao, produzindo o mesmo efeito observavel que a resposta livre por texto equivalente produz hoje.
- **FR-005**: Pedidos de aprovacao de gate (nao-pergunta) DEVEM continuar sendo notificados e processados exatamente como hoje, sem alteracao de comportamento por causa desta feature.
- **FR-006**: Quando o texto da pergunta (antes dos botoes) exceder o limite de tamanho de mensagem do Telegram, o sistema DEVE dividir o conteudo em mensagens sequenciais legiveis, com os botoes anexados a ultima mensagem da sequencia, em vez de truncar ou omitir conteudo.
- **FR-007**: Quando o output da IA nao permitir extrair uma estrutura de pergunta+opcoes parseavel, ou quando o numero/tamanho das opcoes exceder os limites praticos do Telegram, o sistema DEVE cair de volta para o comportamento atual de pergunta em texto livre, em vez de falhar silenciosamente ou descartar a pergunta.
- **FR-008**: O sistema DEVE ignorar toques em botoes associados a uma pergunta ja respondida ou expirada, sem afetar o estado de respostas validas do mesmo step ou de steps subsequentes.
- **FR-009**: O sistema DEVE registrar uma resposta originada de botao com o mesmo nivel de observabilidade/auditoria (historico de run, gates) que uma resposta digitada recebe hoje.

### Key Entities *(include if feature involves data)*

- **Pergunta da IA**: texto da pergunta, lista de opcoes de resposta e referencia ao step/run de origem; distinta de um pedido de aprovacao de gate.
- **Opcao de Resposta**: rotulo exibido no botao e valor propagado de volta ao step quando a opcao e escolhida.
- **Callback do Telegram**: evento de toque em botao, associado a qual pergunta pendente ele responde e qual opcao foi escolhida.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em perguntas reais da IA observadas durante validacao, 100% das opcoes exibidas nos botoes do Telegram correspondem as opcoes de fato apresentadas pela IA (nenhuma substituicao por "aprovar"/"rejeitar" generico).
- **SC-002**: Escolher uma opcao por botao produz o mesmo efeito observavel no step em execucao que a resposta livre por texto equivalente, verificado em 100% dos cenarios de teste cobertos.
- **SC-003**: Fluxos existentes de aprovacao de gate (nao-pergunta) passam sem alteracao de comportamento na suite de testes completa apos a mudanca (zero regressoes).
- **SC-004**: Perguntas cujo texto excede o limite de mensagem do Telegram chegam integralmente legiveis (sem corte silencioso) em 100% dos casos de teste com pergunta longa.
- **SC-005**: Responder a uma pergunta padrao do Telegram passa a exigir um unico toque, contra a necessidade de digitar texto livre no fluxo atual.

## Assumptions

- H19 (deteccao correta de "pergunta da IA" vs "pedido de aprovacao de gate") esta resolvido e disponivel antes desta feature entrar em implementacao real; esta especificacao assume que esse sinal de roteamento ja existe de forma confiavel.
- O formato de output das IAs para perguntas (comecando pelo step `specify`, podendo se estender a outros stages) pode precisar de ajuste no prompt/skill correspondente para produzir pergunta + opcoes de forma estruturada e parseavel — esse ajuste esta dentro do escopo desta feature quando necessario para a extracao funcionar.
- Os limites da Telegram Bot API para inline keyboards (numero pratico de botoes, tamanho de `callback_data`, limite de ~4096 caracteres por mensagem) se aplicam e determinam quando o sistema deve dividir mensagens ou cair para o fallback de texto livre.
- Quando uma pergunta da IA e aberta (sem opcoes discretas, ex. "como devemos nomear esta entidade?"), o sistema mantem o comportamento atual de resposta livre por texto — botoes se aplicam apenas quando ha opcoes discretas extraiveis.
- Existe no maximo uma pergunta pendente de resposta por step ativo, seguindo o mesmo modelo do fluxo de texto livre atual (nao ha necessidade de suportar multiplas perguntas concorrentes no mesmo step).
- O canal de resposta por texto livre permanece disponivel como via alternativa (nao e removido), com os botoes sendo a via primaria e preferida de resposta.
