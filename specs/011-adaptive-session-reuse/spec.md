# Feature Specification: Adaptive Session Reuse Between Steps

**Feature Branch**: `011-adaptive-session-reuse`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Feature: F41 — Reaproveitamento Adaptativo de Sessao entre Steps"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurar a politica de sessao por feature (Priority: P1)

Como pessoa administrando uma feature no backlog, eu quero definir se o modo
adaptativo de reaproveitamento de sessao esta ligado e quais stages devem
continuar sempre isolados, para equilibrar economia de contexto com
previsibilidade operacional em cada feature.

**Why this priority**: Sem essa configuracao por feature, o usuario nao consegue
adotar o novo comportamento de forma controlada nem preservar o isolamento onde
ele continua desejavel.

**Independent Test**: Pode ser testado editando a configuracao de uma feature
no backlog e verificando que a politica salva distingue entre modo desligado,
modo ligado e lista de stages sempre-isolados.

**Acceptance Scenarios**:

1. **Given** uma feature com o modo adaptativo desligado, **When** o usuario
   revisa sua configuracao no backlog, **Then** a feature mostra explicitamente
   que cada stage seguira em sessao isolada.
2. **Given** uma feature com o modo adaptativo ligado e `specify` e `plan`
   marcados como sempre-isolados, **When** o usuario revisa a configuracao,
   **Then** os stages selecionados aparecem como excecoes permanentes ao
   reaproveitamento.

---

### User Story 2 - Reaproveitar sessao quando sobra contexto com seguranca (Priority: P1)

Como pessoa executando um workflow em etapas, eu quero que o sistema
reaproveite automaticamente a sessao do stage anterior quando ainda sobra
janela de contexto suficiente, para evitar perder contexto util sem precisar
reabrir uma sessao nova a cada transicao.

**Why this priority**: Esse e o ganho principal do recurso; sem ele, o produto
continua com o custo de contexto e de continuidade do F27 sem capturar o
beneficio esperado pelo usuario.

**Independent Test**: Pode ser testado executando uma feature com o modo
adaptativo ligado, concluindo um stage com consumo de contexto em ou abaixo de
50% e verificando que o stage seguinte usa a mesma sessao quando nao esta na
lista de sempre-isolados.

**Acceptance Scenarios**:

1. **Given** uma feature com modo adaptativo ligado e nenhum bloqueio de stage,
   **When** um stage termina com 50% ou menos da janela de contexto consumida,
   **Then** o stage seguinte reaproveita a mesma sessao.
2. **Given** uma feature com modo adaptativo ligado e o proximo stage marcado
   como sempre-isolado, **When** o stage anterior termina com 50% ou menos de
   contexto consumido, **Then** o stage seguinte ainda assim inicia em sessao
   nova.

---

### User Story 3 - Aplicar guardrails quando o reuso deixa de ser obvio (Priority: P2)

Como pessoa monitorando runs longas, eu quero que o sistema abra uma nova
sessao quando o consumo de contexto ja esta alto ou quando a politica do stage
exige isolamento, para reduzir risco de estourar janela de contexto ou de
misturar etapas que precisam de separacao.

**Why this priority**: O modo adaptativo so e seguro se mantiver guardrails
claros; sem esse comportamento, o reaproveitamento pode degradar a qualidade da
execucao ou comprometer a previsibilidade do workflow.

**Independent Test**: Pode ser testado executando transicoes de stage com
consumo de contexto em ou acima de 70%, bem como com stages sempre-isolados, e
verificando que ambos iniciam uma nova sessao independentemente de qualquer
tentativa de reaproveitamento.

**Acceptance Scenarios**:

1. **Given** uma feature com modo adaptativo ligado, **When** um stage termina
   com 70% ou mais da janela de contexto consumida, **Then** o stage seguinte
   sempre inicia em sessao nova.
2. **Given** uma feature com modo adaptativo ligado, **When** um stage termina
   com consumo estritamente maior que 50% e estritamente menor que 70%,
   **Then** o sistema aplica a politica definida para a faixa intermediaria
   [NEEDS CLARIFICATION: a faixa >50% e <70% deve sempre abrir nova sessao,
   permitir reaproveitamento com aviso, ou seguir outra politica?].
3. **Given** uma feature com qualquer nivel de consumo de contexto, **When** o
   proximo stage estiver marcado como sempre-isolado, **Then** ele nunca
   reaproveita a sessao anterior.

---

### Edge Cases

- O que acontece quando o modo adaptativo esta desligado, mas a feature tambem
  possui uma lista de stages sempre-isolados? O comportamento observado
  continua sendo o mesmo do fluxo totalmente isolado atual, sem efeitos
  colaterais extras.
- O que acontece quando o stage termina exatamente nos limiares de 50% ou 70%?
  Os valores de fronteira seguem as regras explicitas do recurso: `<=50%`
  permite reaproveitamento e `>=70%` exige nova sessao.
- O que acontece quando o stage termina na faixa intermediaria entre 50% e 70%?
  A resposta depende da politica escolhida para essa faixa e precisa ser
  confirmada nesta etapa.
- O que acontece quando a medicao de contexto necessaria para decidir o
  proximo stage nao esta confiavel ou disponivel para a sessao concluida? O
  sistema nao deve tomar uma decisao ambigua sem uma politica definida e
  auditavel.
- O que acontece quando um usuario marca como sempre-isolado um stage que
  normalmente seria elegivel para reuso? A configuracao por feature prevalece
  sempre sobre a elegibilidade calculada pelo consumo de contexto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer, por feature no backlog, uma configuracao
  explicita para habilitar ou desabilitar o modo adaptativo de reaproveitamento
  de sessao entre stages consecutivos.
- **FR-002**: Quando o modo adaptativo estiver desabilitado, o sistema MUST
  manter comportamento observavel identico ao fluxo atual de sessoes isoladas,
  iniciando uma nova sessao para cada stage.
- **FR-003**: Quando o modo adaptativo estiver habilitado, o sistema MUST
  reaproveitar a sessao encerrada pelo stage anterior para o proximo stage
  elegivel quando o consumo de contexto ao fim do stage for igual ou inferior a
  50% da janela disponivel.
- **FR-004**: Quando o modo adaptativo estiver habilitado, o sistema MUST
  iniciar uma nova sessao para o proximo stage quando o consumo de contexto ao
  fim do stage anterior for igual ou superior a 70% da janela disponivel.
- **FR-005**: O sistema MUST permitir que o usuario defina, por feature, uma
  lista de stages que sempre rodam em sessao isolada, independentemente do modo
  adaptativo estar ligado e independentemente do consumo de contexto observado.
- **FR-006**: Stages marcados como sempre-isolados MUST sempre prevalecer sobre
  qualquer decisao de reaproveitamento baseada em consumo de contexto.
- **FR-007**: O sistema MUST usar a telemetria de contexto ja adotada pelo
  produto como unica referencia para calcular o percentual consumido ao fim de
  cada stage, evitando fontes paralelas de medicao para a mesma decisao.
- **FR-008**: O sistema MUST tornar auditavel, para cada transicao de stage, se
  a proxima execucao ocorreu por reaproveitamento permitido, por forca de novo
  limiar, por configuracao sempre-isolada, por modo adaptativo desligado ou por
  falta de telemetria confiavel.
- **FR-009**: Para consumo de contexto estritamente maior que 50% e estritamente
  menor que 70%, o sistema MUST [NEEDS CLARIFICATION: qual politica deve reger
  a faixa intermediaria entre reuso garantido e isolamento obrigatorio?].
- **FR-010**: Se a telemetria de contexto usada para a decisao nao estiver
  disponivel ou nao puder ser considerada confiavel para a transicao, o sistema
  MUST iniciar uma nova sessao para o proximo stage e registrar que a decisao
  ocorreu por falta de medicao confiavel.

### Key Entities

- **Feature Session Policy**: configuracao por feature que define se o modo
  adaptativo esta habilitado e quais stages devem permanecer sempre isolados.
- **Stage Transition Decision**: resultado registrado ao fim de um stage que
  explica se o proximo stage deve reaproveitar a sessao atual ou iniciar uma
  nova sessao, incluindo a justificativa aplicada.
- **Session Context Telemetry**: leitura operacional da sessao concluida que
  informa o percentual de janela de contexto consumida e sustenta a decisao da
  proxima transicao.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com o modo adaptativo desligado, 100% das transicoes entre stages
  observadas em features configuradas dessa forma iniciam uma nova sessao.
- **SC-002**: Com o modo adaptativo ligado e sem bloqueio por stage
  sempre-isolado, 100% das transicoes com consumo de contexto igual ou inferior
  a 50% reaproveitam a sessao anterior.
- **SC-003**: Com o modo adaptativo ligado, 100% das transicoes com consumo de
  contexto igual ou superior a 70% iniciam uma nova sessao.
- **SC-004**: Em 100% das transicoes com consumo entre 50% e 70%, o sistema
  aplica de forma consistente a politica definida para a faixa intermediaria e
  registra o motivo da decisao.
- **SC-005**: Em 100% das features que definem stages sempre-isolados, esses
  stages iniciam em nova sessao independentemente do consumo de contexto da
  sessao anterior.
- **SC-006**: Em 100% das transicoes de stage avaliadas, o motivo da decisao de
  sessao fica disponivel para consulta operacional posterior.

## Assumptions

- A feature F27 continua sendo a baseline operacional: sem o modo adaptativo, o
  produto preserva a separacao de sessao por stage ja entregue.
- A telemetria de contexto introduzida por F30 e a base prevista para esta
  decisao; se houver inconsistencias abertas nessa medicao, elas precisam estar
  resolvidas ou mitigadas para que os limiares sejam confiaveis.
- A configuracao de politica de sessao pertence ao backlog no nivel da feature,
  nao a uma preferencia global obrigatoria para todo o projeto.
- `specify` e `plan` sao exemplos iniciais de stages que podem ser marcados
  como sempre-isolados, mas a funcionalidade nao deve ficar limitada apenas a
  esses dois nomes.
