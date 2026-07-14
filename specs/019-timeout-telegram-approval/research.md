# Research — F55 timeout approval via Telegram

## Decision: Use a typed timeout result from adapters

**Rationale:** `runCli` already distinguishes `CliTimeoutError`, but Codex e
Claude atualmente achatam esse erro em um `RunResult` textual. Um sinal tipado
separa timeout de exit failure, abort manual, gate e input sem parsing frágil.

**Alternatives considered:** detectar `summary.startsWith('timeout')` foi
rejeitado por depender de idioma/formato; tratar todo failure como recuperável
foi rejeitado porque mudaria o comportamento de gates e falhas atuais.

## Decision: Add dedicated timeout occurrence and approval tables

**Rationale:** `stage_requests` não possui duração, progresso, estado de entrega
ou identidade da ocorrência. Tabelas dedicadas permitem unicidade e auditoria
com SQLite, preservando os contratos de stage approval/input.

**Alternatives considered:** adicionar um novo `kind` a `stage_requests` foi
rejeitado por sobrecarregar semântica de estágio; reutilizar `gates` foi
rejeitado porque gate tem comandos e política distintos.

## Decision: Pause and wait through the existing staged checkpoint

**Rationale:** `executeBacklog` já persiste run/pipeline, checkpoint de estágio
e espera por decisões Telegram. O timeout pode retornar um controle dedicado,
reentrando apenas no estágio afetado e preservando etapas concluídas.

**Alternatives considered:** novo processo `msq run` foi rejeitado por risco de
pipelines duplicados e por contrariar resume persistido; retry automático foi
rejeitado por FR-005/FR-008.

## Decision: Resolve callbacks with SQLite compare-and-set and topic validation

**Rationale:** o poller já valida chat e associação de tópico para gates/stages.
Timeout callbacks devem consultar contexto imutável e alterar somente request
pendente correspondente; claim e referência única de retry impedem duas ações.

**Alternatives considered:** mapa em memória foi rejeitado por não sobreviver a
restart; check seguido de update incondicional foi rejeitado por corrida entre
dispositivos.

## Decision: Record notification delivery separately from decision state

**Rationale:** `dispatch` usa `Promise.allSettled`, então chamada concluída não
prova entrega Telegram. O request registra tentativas, sucesso/erro e mantém
estado pendente quando o canal falha.

**Alternatives considered:** tratar `dispatch` como prova foi rejeitado; retry
automático de entrega foi deixado fora do escopo para não gerar spam.

## Decision: No external research dependency is needed

**Rationale:** o repositório já contém Bot API `sendMessage`, callback polling,
associação de tópicos, SQLite, event bus e timeout dos adapters. Não há escolha
externa instável necessária para este plano.

**Alternatives considered:** nova biblioteca de mensagens ou fila externa foi
rejeitada por duplicar infraestrutura existente e ampliar o escopo.
