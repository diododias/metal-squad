# Feature Specification: Heartbeat como spinner de status

**Feature Branch**: `feat/f53-heartbeat-spinner-status`
**Created**: 2026-07-13
**Status**: Draft
**Roadmap**: V1 — Marco 1 (Fundação + Quick Wins)

## Input

> "Heartbeat → spinner — heartbeat hoje só repete a última mensagem da IA;
> trocar por spinner que reporta status (execução / interrupção / falha). Avaliar
> estados visuais. Tool calls podem ganhar indentação e agrupamento/minimização."

Hoje o heartbeat (`spawn.ts`, `onHeartbeat`) emite periodicamente uma linha de
texto crua com tempo decorrido, bytes de stdout/stderr e tempo ocioso, além de
ecoar a última mensagem da IA. O resultado é ruidoso e não comunica **estado** —
o usuário não distingue "trabalhando", "parada/ociosa" e "falhando" com clareza.

## User Scenarios & Testing

### User Story 1 — Ver que a sessão está viva e trabalhando
Como usuário acompanhando uma run no web, quero um indicador de status animado
(spinner) que diga claramente que o agente está executando, para não confundir
uma sessão lenta com uma travada.

**Fluxo**: run em andamento → o web mostra um spinner + rótulo "Executando" com
tempo decorrido → enquanto houver output/heartbeat, o spinner permanece ativo.

**Aceite**: o estado "Executando" é distinguível visualmente de "Ocioso" e de
"Falha" sem o usuário ler bytes de stdout.

### User Story 2 — Perceber ociosidade/interrupção
Como usuário, quero que o indicador mude quando a sessão fica muito tempo sem
produzir output (possível travamento) ou é interrompida, para decidir se
aguardo, respondo uma pergunta pendente ou aborto.

**Fluxo**: sessão sem novo output além de um limiar de ociosidade → estado muda
para "Ocioso/aguardando" com o tempo ocioso → em interrupção/abort → estado
"Interrompido" → em erro → estado "Falha".

**Aceite**: os estados `executando`, `ocioso`, `interrompido`, `falha` são
emitidos como eventos e refletidos na UI de forma inequívoca.

### User Story 3 — Tool calls agrupadas e minimizáveis
Como usuário lendo o transcript, quero que chamadas de ferramenta apareçam
indentadas e agrupáveis/minimizáveis, para não me afogar em ruído e focar no
raciocínio principal.

**Fluxo**: agente dispara várias tool calls → aparecem indentadas sob o passo
atual, agrupadas → usuário pode minimizar o grupo → o card de status continua
mostrando "N tool calls" resumido.

**Aceite**: tool calls são visualmente subordinadas ao passo, colapsáveis, e o
estado de colapso é preservado durante a run.

### Edge Cases
- **Sem heartbeat configurado** (`heartbeatMs = 0`): o indicador deve refletir
  apenas transições de estado por eventos, sem spinner periódico enganoso.
- **Output em rajada após ociosidade**: o estado deve voltar a "Executando" assim
  que chegar novo output, sem "piscar".
- **Falha vs. timeout**: falha de processo e timeout (ver F55) precisam de
  estados distintos.
- **TUI aposentada**: a TUI (`src/ui/`) não recebe evolução; se algo do heartbeat
  só existir lá, o padrão é remover, não portar — o alvo é `msq web`.
- **Streams múltiplos**: várias features rodando em paralelo, cada card com seu
  próprio estado independente.

## Requirements

### Functional Requirements
- **FR-001**: O sistema DEVE emitir estados de sessão discretos — no mínimo
  `executando`, `ocioso`, `interrompido`, `falha` (e `concluído`) — em vez de
  apenas repetir a última mensagem da IA. `interrompido` mapeia para o
  `CliAbortError` existente; `falha` para `CliTimeoutError`/exit ≠ 0.
- **FR-002**: A transição para `ocioso` DEVE ocorrer quando o tempo sem novo
  output ultrapassar um limiar configurável.
- **FR-003**: O timer que **detecta** estado (ociosidade/tick) DEVE ser separado
  do spinner **visual**. Hoje `heartbeatMs` tem default `0` (`spawn.ts`), o que
  desliga o `setInterval` e impossibilitaria a detecção de ociosidade — o
  mecanismo de detecção de estado NÃO pode depender de o spinner visual estar
  ligado, e DEVE funcionar mesmo com o spinner desabilitado.
- **FR-004**: A configuração DEVE expor uma chave de limiar de ociosidade (ex.:
  `idleThresholdMs`) no `ConfigSchema` — hoje inexistente — para que "limiar
  configurável" (FR-002) seja testável.
- **FR-005**: O web DEVE renderizar um spinner animado no estado `executando` e
  representações visuais distintas para os demais estados.
- **FR-006**: O indicador DEVE exibir tempo decorrido e, quando ocioso, o tempo
  de ociosidade.
- **FR-007**: Os adapters (`claude`/`codex`/`opencode`) DEVEM emitir eventos
  **estruturados** de tool call (início/fim/args), não apenas linhas de texto
  (`OutputSource` atual), para viabilizar agrupamento — este é pré-requisito de
  FR-008.
- **FR-008**: Tool calls DEVEM ser exibidas indentadas e agrupadas sob o passo
  corrente, com possibilidade de minimizar/expandir.
- **FR-009**: Os eventos de estado DEVEM carregar `runId`/`featureId` e ser
  transportados pelo event bus/WebSocket existente, sem parsing frágil de bytes na
  UI, permitindo que cada card isole seu estado em execução paralela.
- **FR-010**: O comportamento DEVE permitir desabilitar apenas o spinner visual,
  sem desligar a detecção de estado (ver FR-003).
- **FR-011**: Trechos exclusivos da TUI relacionados a heartbeat DEVEM ser
  removidos, não evoluídos.

### Key Entities
- **Session Status**: enum de estados da sessão + metadados (elapsed, idle,
  motivo da falha/interrupção).
- **Heartbeat Event**: evento periódico/transicional publicado no event bus,
  carregando o status em vez de texto cru.
- **Tool Call Group**: agrupamento lógico de tool calls sob um passo, com estado
  de colapso.

## Success Criteria

### Measurable Outcomes
- **SC-001**: 100% das runs expõem ao menos os estados
  executando/ocioso/falha/concluído durante seu ciclo de vida (verificável por
  teste do event bus).
- **SC-002**: A UI reflete a transição para "ocioso" dentro de ≤ 1 ciclo de
  heartbeat após o limiar ser atingido.
- **SC-003**: Usuários conseguem colapsar/expandir grupos de tool calls, com o
  estado preservado durante toda a run.
- **SC-004**: Nenhuma linha de heartbeat exibe apenas contagem de bytes crus como
  informação primária de status.
- **SC-005**: 0 referências vivas a heartbeat na TUI após a entrega (removidas).

## Dependencies & Open Decisions
- **Eventos estruturados de tool call (FR-007) são uma mudança nos adapters**, não
  só na UI — precisa entrar no plan como trabalho de adapter, não cosmético.
- Os estados definidos aqui são consumidos por F55 (alerta de timeout) e F58
  (card); a nomenclatura do enum deve ser fixada nesta spec e reutilizada.

## Assumptions
- O mecanismo periódico atual (`setInterval` em `spawn.ts`) é mantido como fonte
  de "batimento", mas o default `heartbeatMs = 0` precisa ser reavaliado para não
  quebrar a detecção de ociosidade (ver FR-003/FR-010).
- Estados visuais finais (cores/ícones) seguem o token set do web
  (`src/web/client/tokens`).
