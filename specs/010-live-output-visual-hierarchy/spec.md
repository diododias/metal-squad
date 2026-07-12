# Feature Specification: Live Output — Hierarquia Visual e Cores Mutadas

**Feature Branch**: `010-live-output-visual-hierarchy`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "F38 — Live Output: Hierarquia Visual e Cores Mutadas — redesenhar a apresentacao das entries de tool call no painel Live Output do detalhe de run (dashboard web) para reduzir competicao visual com a narrativa do agente, sem alterar dados ou comportamento de streaming."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Acompanhar o raciocinio do agente sem distracao visual (Priority: P1)

Como usuario acompanhando uma run ativa no dashboard web, ao rolar o painel Live
Output eu quero que o texto de narrativa/raciocinio do agente seja o elemento
visualmente mais proeminente da tela, para que eu consiga seguir o que o agente
esta pensando e decidindo sem que blocos de chamada de ferramenta chamem mais
atencao do que o raciocinio em si.

**Why this priority**: E o problema central relatado — hoje os blocos de tool
call competem com (e ate vencem) a narrativa em destaque visual, invertendo a
prioridade de leitura esperada pelo usuario.

**Independent Test**: Pode ser testado abrindo o detalhe de uma run real com
eventos de narrativa e de tool call intercalados e verificando visualmente que
o texto de narrativa se destaca mais do que os blocos de tool call.

**Acceptance Scenarios**:

1. **Given** um painel Live Output com uma linha de narrativa do agente seguida
   de uma chamada de ferramenta, **When** o usuario visualiza o painel, **Then**
   a linha de narrativa aparece com contraste normal de texto e a linha de tool
   aparece visivelmente mais apagada/secundaria.
2. **Given** uma sequencia de varias chamadas de ferramenta em texto curto,
   **When** renderizadas no painel, **Then** nenhuma delas ocupa a largura total
   do container ao ponto de parecer um card de mesmo peso visual que a
   narrativa.

---

### User Story 2 - Identificar rapidamente uma chamada de ferramenta sem ela "gritar" (Priority: P2)

Como usuario, quero continuar conseguindo identificar rapidamente quando uma
linha do Live Output representa uma chamada de ferramenta (e nao narrativa ou
erro), mesmo com o novo tratamento visual mais discreto, para nao perder a
distincao semantica entre os tipos de evento.

**Why this priority**: O objetivo e reduzir destaque, nao eliminar a
diferenciacao — perder a distincao tornaria o log mais dificil de ler, nao
mais facil.

**Independent Test**: Pode ser testado visualizando um trecho do Live Output
com narrativa, tool call, heartbeat e stderr juntos e confirmando que os
quatro tipos continuam visualmente distinguiveis entre si, com a chamada de
ferramenta claramente identificavel como tal (por exemplo, por indicador ou
prefixo) mesmo com cor apagada.

**Acceptance Scenarios**:

1. **Given** um painel com os quatro tipos de entry (narrativa, tool,
   heartbeat, stderr) em sequencia, **When** o usuario observa o painel,
   **Then** cada tipo e reconhecivel por um tratamento visual proprio e
   consistente.

---

### User Story 3 - Continuar identificando erros imediatamente (Priority: P1)

Como usuario monitorando uma run, quero que linhas de erro (`stderr`)
continuem tendo destaque visual de alerta, para que eu note falhas mesmo
enquanto o restante do log fica mais discreto.

**Why this priority**: Erros sao a informacao mais critica do painel; qualquer
mudanca de hierarquia visual nao pode reduzir a visibilidade de falhas, sob
risco de o usuario deixar de perceber uma run com problema.

**Independent Test**: Pode ser testado verificando que uma linha `stderr`
mantem a mesma cor de alerta usada hoje, independentemente das mudancas nas
entries de tool.

**Acceptance Scenarios**:

1. **Given** um painel Live Output contendo uma linha de erro (`stderr`),
   **When** comparado ao estado anterior a esta mudanca, **Then** a linha de
   erro mantem o mesmo nivel de destaque visual (cor de alerta).

---

### Edge Cases

- O que acontece quando uma chamada de ferramenta tem um texto muito longo
  (ex.: um comando de shell extenso)? O texto deve ser truncado de forma
  visivelmente compacta, sem voltar a ocupar a largura total do container.
- O que acontece quando ha varias chamadas de ferramenta consecutivas sem
  nenhuma narrativa entre elas? Cada uma deve continuar compacta e mutada
  individualmente, sem se fundir visualmente numa unica massa indistinguivel.
- O que acontece com uma chamada de ferramenta de texto muito curto (ex.: um
  unico token)? Ela nao deve esticar ate a largura do container so porque o
  texto e curto.
- O que acontece em telas estreitas (largura de container reduzida)? A
  legibilidade da narrativa e do indicador de erro deve ser preservada; a
  entry de tool deve continuar compacta relativa ao espaco disponivel.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O painel Live Output MUST apresentar entries de chamada de
  ferramenta ("tool") ocupando visivelmente menos largura horizontal do que
  hoje, sem esticar borda-a-borda do container do log independentemente do
  tamanho do texto.
- **FR-002**: O painel Live Output MUST apresentar entries de tool com
  contraste de cor visivelmente mais baixo (mais apagado) do que o texto de
  narrativa/raciocinio do agente, comparavel ao nivel de contraste ja usado
  para entries de heartbeat.
- **FR-003**: O painel Live Output MUST preservar o contraste atual do texto
  de narrativa do agente (entries default), sem reduzir sua legibilidade.
- **FR-004**: O painel Live Output MUST preservar o destaque de alerta atual
  das entries de erro (`stderr`), sem reduzir sua visibilidade.
- **FR-005**: O painel Live Output MUST manter as entries de heartbeat com o
  tratamento visual mutado/italico ja existente, sem alteracao.
- **FR-006**: O painel Live Output MUST continuar distinguindo visualmente os
  quatro tipos de entry (narrativa, tool, heartbeat, stderr) entre si, mesmo
  apos o novo tratamento mais discreto das entries de tool.
- **FR-007**: A mudanca MUST afetar apenas a apresentacao das entries; o
  conteudo textual mostrado ao usuario, a fonte dos dados de output e o
  comportamento de streaming/atualizacao ao vivo MUST permanecer inalterados.
- **FR-008**: A mudanca aplica-se exclusivamente ao painel Live Output do
  detalhe de run no dashboard web; a interface de terminal (TUI) MUST
  permanecer fora de escopo e sem alteracoes.

### Key Entities

- **Output Entry**: um evento individual exibido no painel Live Output,
  classificado por origem/tipo (narrativa do agente, chamada de ferramenta,
  heartbeat, erro), contendo o texto da linha e determinando seu tratamento
  visual.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ao rolar o Live Output de uma run real com narrativa e tool
  calls intercalados, um observador identifica a narrativa do agente como o
  elemento mais proeminente da tela em 100% das amostras verificadas.
- **SC-002**: Nenhuma entry de tool call ocupa a largura total do container do
  log, independente do tamanho do texto da chamada, em qualquer run
  verificada.
- **SC-003**: O contraste de cor da entry de tool e reduzido a um nivel
  comparavel ao da entry de heartbeat, verificavel por inspecao visual lado a
  lado.
- **SC-004**: Entries de narrativa e de erro nao sofrem nenhuma reducao de
  contraste perceptivel em comparacao ao estado anterior a mudanca.

## Assumptions

- A distincao semantica entre os quatro tipos de entry (narrativa, tool,
  heartbeat, stderr) continua necessaria; a mudanca e de apresentacao visual,
  nao de remocao de categorias.
- O padrao de referencia para o novo tratamento visual de tool calls e o estilo
  compacto e apagado usado por CLIs de mercado (linha unica, label curto,
  texto truncado, sem card com fundo proprio).
- A fonte de dados do Live Output (stream ao vivo dos eventos) e sua cadencia
  de atualizacao nao mudam; apenas a forma como cada evento e desenhado na
  tela.
- A interface de terminal (TUI) possui um tratamento visual proprio e
  semelhante para linhas de erro, mas esta fora do escopo desta mudanca.
