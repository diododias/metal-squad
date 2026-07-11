# Feature Specification: Adapter Fallback em Retry + Resume no Step que Falhou

**Feature Branch**: `009-adapter-fallback-retry-resume`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "F39 — Adapter Fallback em Retry + Resume no Step que Falhou: quando um adapter falha ou estoura budget, permitir trocar tool/model/effort e retomar a mesma run/pipeline reexecutando somente o step pendente, sem perder o rastreio acumulado de tokens (incluindo tentativas que falharam)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fallback automatico de ferramenta apos esgotar tentativas (Priority: P1)

Como operador de uma pipeline, quando a ferramenta configurada para uma feature falha repetidamente (crash, timeout, rate limit) ate esgotar o numero maximo de tentativas, quero que o sistema tente automaticamente uma ferramenta alternativa pre-configurada antes de desistir ou pausar a pipeline, para que falhas transitorias ou indisponibilidade de uma ferramenta especifica nao interrompam o progresso do trabalho.

**Why this priority**: E o cenario mais frequente de perda de tempo hoje — uma ferramenta indisponivel ou com rate limit bloqueia a pipeline inteira mesmo quando uma alternativa configurada resolveria o problema automaticamente.

**Independent Test**: Pode ser testado configurando uma feature com uma lista de fallback, forcando falha da ferramenta primaria ate esgotar as tentativas, e verificando que a proxima ferramenta da lista assume automaticamente sem intervencao manual.

**Acceptance Scenarios**:

1. **Given** uma feature configurada com ferramenta primaria e uma lista de fallback, **When** a ferramenta primaria esgota o numero maximo de tentativas configurado, **Then** o sistema tenta automaticamente a proxima ferramenta da lista de fallback antes de aplicar a acao de falha padrao (parar, continuar ou abrir aprovacao manual).
2. **Given** uma lista de fallback com mais de uma alternativa, **When** a primeira alternativa tambem esgota suas tentativas, **Then** o sistema avanca para a proxima alternativa da lista, na ordem configurada, ate a lista se esgotar.
3. **Given** todas as alternativas de fallback se esgotam sem sucesso, **When** a ultima tentativa falha, **Then** o sistema aplica a acao de falha configurada (parar, continuar ou abrir aprovacao) exatamente como acontece hoje quando nao ha fallback.

---

### User Story 2 - Retomar a mesma execucao trocando ferramenta pontualmente (Priority: P1)

Como operador, quando uma execucao pausada ou com aprovacao pendente por estouro de limite de uso precisa continuar, quero poder retomar essa execucao especifica indicando uma ferramenta e/ou modelo diferentes apenas para essa retomada, sem alterar a configuracao padrao do projeto, para resolver o bloqueio pontual sem afetar execucoes futuras.

**Why this priority**: Sem isso, o operador so pode reexecutar do zero (perdendo o que ja foi concluido) ou esperar o mesmo adapter voltar a funcionar; ambos sao caros em tempo e em custo de uso.

**Independent Test**: Pode ser testado retomando uma execucao pausada com uma ferramenta/modelo diferentes informados na retomada, e verificando que a mesma execucao continua (mesmo identificador) usando a alternativa informada, sem reiniciar partes ja concluidas.

**Acceptance Scenarios**:

1. **Given** uma execucao pausada por falha esgotada ou por limite de uso atingido, **When** o operador retoma essa execucao informando uma ferramenta e/ou modelo alternativos, **Then** a mesma execucao (mesmo identificador) continua com a alternativa informada, sem criar uma execucao nova.
2. **Given** uma retomada com ferramenta/modelo alternativos, **When** a retomada termina com sucesso, **Then** a configuracao padrao do projeto permanece inalterada (a troca vale apenas para essa retomada pontual).
3. **Given** uma execucao com multiplas etapas sequenciais onde algumas ja estao concluidas, **When** o operador retoma com ferramenta/modelo alternativos, **Then** somente a etapa que estava em andamento ou que falhou e reexecutada; etapas ja concluidas nao rodam novamente.

---

### User Story 3 - Visibilidade do custo real acumulado da execucao (Priority: P2)

Como operador que acompanha custo e uso de uma execucao, quero ver o total de uso acumulado de uma execucao — incluindo o consumo de tentativas que falharam antes de uma alternativa ter sucesso — para tomar decisoes informadas sobre orcamento e nao subestimar o custo real de uma feature que precisou de fallback.

**Why this priority**: Sem essa visibilidade, o operador acredita que uma feature custou apenas o valor da tentativa final bem-sucedida, quando na verdade o custo real inclui tudo que foi gasto nas tentativas anteriores — levando a decisoes erradas de orcamento.

**Independent Test**: Pode ser testado executando uma feature que falha uma vez e depois é concluida com sucesso via fallback, e verificando que o total de uso exibido para essa execucao soma o consumo de ambas as tentativas, nao apenas da ultima.

**Acceptance Scenarios**:

1. **Given** uma execucao que teve uma tentativa falha antes de suceder com uma alternativa, **When** o operador consulta o status ou o painel dessa execucao, **Then** o total de uso exibido soma o consumo de todas as tentativas, incluindo as que falharam.
2. **Given** uma execucao com multiplas tentativas usando ferramentas diferentes, **When** o operador consulta o historico de tentativas dessa execucao, **Then** cada tentativa mostra qual ferramenta e modelo foram usados nela.

---

### Edge Cases

- O que acontece quando o operador informa na retomada uma ferramenta que nao esta disponivel/instalada no ambiente? O sistema deve rejeitar a retomada com uma mensagem clara antes de consumir qualquer uso, sem marcar a execucao como falha permanente.
- O que acontece quando a lista de fallback esta vazia ou nao configurada? O comportamento deve ser identico ao atual (sem fallback): aplicar a acao de falha configurada assim que a ferramenta primaria esgota as tentativas.
- O que acontece se o limite de uso (orcamento) estourar durante uma tentativa de fallback (nao apenas na ferramenta primaria)? O mesmo mecanismo de resolucao de limite (incluindo troca pontual de ferramenta/modelo) deve se aplicar, independente de qual tentativa estava ativa quando o limite foi atingido.
- O que acontece quando o operador tenta retomar uma execucao que ja esta totalmente concluida? O sistema deve informar que nao ha etapa pendente a reexecutar, sem duplicar trabalho.
- O que acontece com o historico de tentativas de execucoes anteriores a esta funcionalidade, que nao tem ferramenta/modelo registrados por tentativa? A ausencia de dado historico deve ser tratada de forma visivelmente distinta de "nao aplicavel", sem quebrar a exibicao do historico existente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir configurar, por feature, uma lista ordenada de alternativas de ferramenta (e opcionalmente modelo/nivel de esforco/numero de tentativas) a serem tentadas apos a ferramenta primaria esgotar seu numero maximo de tentativas.
- **FR-002**: Ao esgotar as tentativas da ferramenta primaria, o sistema MUST tentar automaticamente a proxima alternativa da lista configurada, na ordem definida, antes de aplicar a acao de falha (parar, continuar ou abrir aprovacao manual).
- **FR-003**: Quando todas as alternativas configuradas se esgotarem sem sucesso, o sistema MUST aplicar a acao de falha configurada, com o mesmo comportamento observado hoje quando nao ha alternativas.
- **FR-004**: O sistema MUST permitir que o operador retome uma execucao pausada ou aguardando aprovacao informando uma ferramenta e/ou modelo/esforco alternativos apenas para essa retomada especifica.
- **FR-005**: Uma retomada com ferramenta/modelo alternativos MUST continuar a mesma execucao (mesmo identificador) em vez de criar uma nova, preservando o trabalho ja concluido.
- **FR-006**: Uma retomada com ferramenta/modelo alternativos MUST reexecutar apenas a etapa que estava em andamento ou que havia falhado, sem repetir etapas ja concluidas dentro de um fluxo com multiplas etapas sequenciais.
- **FR-007**: Uma retomada com ferramenta/modelo alternativos MUST NOT alterar a configuracao padrao persistida do projeto ou da feature; a troca vale apenas para aquela retomada.
- **FR-008**: O mecanismo de resolucao usado quando uma execucao atinge o limite de uso (orcamento) configurado MUST oferecer a troca de ferramenta/modelo como uma das formas de resolver o bloqueio, reaproveitando o mesmo mecanismo de alternativas usado no fallback automatico.
- **FR-009**: O sistema MUST acumular o total de uso (consumo de tokens/recursos) de uma execucao ao longo de todas as suas tentativas, incluindo tentativas que falharam antes de uma alternativa ter sucesso, em vez de refletir apenas a tentativa mais recente.
- **FR-010**: O sistema MUST registrar, para cada tentativa de uma execucao, qual ferramenta e modelo foram usados, de forma consultavel pelo operador.
- **FR-011**: As telas/consultas de status de uma execucao MUST exibir a ferramenta/modelo usados em cada tentativa e o total de uso acumulado real da execucao (incluindo tentativas falhas).
- **FR-012**: O sistema MUST rejeitar uma retomada com ferramenta indisponivel no ambiente antes de consumir qualquer uso, informando o motivo ao operador.
- **FR-013**: O sistema MUST informar ao operador quando nao houver etapa pendente para reexecutar em uma execucao que ja esta totalmente concluida.

### Key Entities *(include if feature involves data)*

- **Configuracao de alternativas (fallback)**: lista ordenada associada a uma feature, com ferramenta e, opcionalmente, modelo/esforco/numero de tentativas por alternativa; usada tanto no esgotamento de tentativas quanto na resolucao de limite de uso.
- **Execucao (run/pipeline)**: unidade retomavel identificada por um identificador estavel; acumula uso total ao longo de suas tentativas e mantem o progresso de etapas concluidas, em andamento e pendentes.
- **Tentativa (attempt)**: uma execucao individual de uma etapa por uma ferramenta/modelo especificos; registra sucesso/falha e o uso consumido nela.
- **Historico de tentativas**: registro consultavel de todas as tentativas de uma execucao, incluindo ferramenta/modelo usados e resultado de cada uma.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma execucao cuja ferramenta primaria falha repetidamente consegue concluir com sucesso via alternativa configurada sem intervencao manual do operador em pelo menos 95% dos casos onde a alternativa esta corretamente configurada e disponivel.
- **SC-002**: O operador consegue retomar uma execucao pausada com ferramenta/modelo alternativos e ver o trabalho ja concluido preservado (nao repetido) em 100% dos casos testados.
- **SC-003**: O total de uso exibido para uma execucao com fallback reflete a soma real de todas as tentativas (incluindo as falhas) com discrepancia zero em relacao ao uso individual registrado por tentativa.
- **SC-004**: O operador consegue identificar, para qualquer execucao consultada, qual ferramenta/modelo foi usado em cada tentativa sem precisar consultar logs brutos.

## Assumptions

- A lista de alternativas de fallback e configurada previamente pelo operador/mantenedor da feature (nao e sugerida automaticamente pelo sistema).
- "Mesma execucao" significa que o identificador usado para consultar status, uso acumulado e historico permanece o mesmo antes e depois de uma retomada com alternativa, mesmo que a ferramenta/modelo tenham mudado no meio do caminho.
- A troca pontual de ferramenta/modelo na retomada nao exige que o operador edite a configuracao persistida do projeto; e um override valido apenas para aquela retomada.
- Fluxos com multiplas etapas sequenciais (onde parte do trabalho ja foi concluida) sao um cenario suportado hoje e devem continuar funcionando com a retomada por alternativa, sem regressao no que ja funciona.
- Execucoes concluidas antes desta funcionalidade existir podem nao ter ferramenta/modelo registrados por tentativa; isso e aceitavel e deve ser exibido de forma clara como dado indisponivel, nao como erro.
