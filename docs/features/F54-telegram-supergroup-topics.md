# Feature Specification: Telegram — supergroup com um tópico por feature

**Feature Branch**: `feat/f54-telegram-supergroup-topics`
**Created**: 2026-07-13
**Status**: Draft
**Roadmap**: V1 — Marco 1 (Fundação + Quick Wins)

## Input

> "Telegram: supergroup por tópico — cada feature reporta notificações num tópico
> separado dentro de um supergroup."

Hoje as notificações Telegram vão todas para um único `chatId`
(`TelegramChannel`), com suporte opcional a um `forumTopicId` **fixo** por
configuração (`message_thread_id`). Não há roteamento por feature: várias
features executando em paralelo despejam mensagens no mesmo fluxo, dificultando
acompanhar uma feature específica.

## User Scenarios & Testing

### User Story 1 — Acompanhar uma feature em seu próprio tópico
Como usuário rodando várias features em paralelo, quero que cada feature reporte
em um tópico dedicado dentro de um supergroup, para acompanhar o progresso de
uma feature sem ruído das outras.

**Fluxo**: run de `F-ABCD1234` inicia → o sistema garante um tópico "F-ABCD1234 —
<título>" no supergroup → todas as notificações dessa feature (start, gate,
pergunta, conclusão, falha) vão para esse tópico.

**Aceite**: mensagens de features distintas nunca se misturam no mesmo tópico; o
tópico traz o ID + título da feature.

### User Story 2 — Criação/reuso automático de tópico
Como usuário, quero que o tópico seja criado automaticamente na primeira
notificação de uma feature e reutilizado nas próximas, para não precisar
gerenciar tópicos manualmente no Telegram.

**Fluxo**: primeira notificação da feature → cria o forum topic via API do
Telegram e memoriza o `message_thread_id` → notificações seguintes reusam o
mesmo tópico → nova run da mesma feature reaproveita o tópico existente.

**Aceite**: no máximo um tópico por feature; reruns não duplicam tópicos.

### User Story 3 — Fallback para chat simples
Como usuário cujo chat de destino não é um supergroup com fóruns habilitados,
quero que as notificações continuem funcionando (num fluxo único), para não
perder notificações por causa de configuração ausente.

**Fluxo**: `chatId` não é supergroup/fórum → o sistema detecta e envia sem
`message_thread_id`, mantendo o comportamento atual → registra um aviso único
orientando habilitar tópicos.

**Aceite**: ausência de suporte a tópicos degrada graciosamente, sem erro fatal
nem perda de mensagens.

### Edge Cases
- **Limite de tópicos do Telegram / rate limit**: criação de tópicos deve tratar
  429 e limites, com retry/backoff e sem travar a run.
- **Feature sem ID persistido** (pré-F52): usar fallback estável para nomear o
  tópico, sem criar tópicos duplicados.
- **Tópico apagado manualmente** pelo usuário: detectar `thread not found` e
  recriar, atualizando o mapeamento.
- **Título muito longo/emoji**: sanitizar o nome do tópico dentro dos limites da
  API (reusar `notify/sanitize.ts`).
- **Token/`chatId` ausente**: manter o no-op atual (não notifica) sem quebrar.

## Requirements

### Functional Requirements
- **FR-001**: O sistema DEVE rotear as notificações de cada feature para um
  tópico próprio dentro de um supergroup Telegram configurado.
- **FR-002**: O `featureId` (e o chat de destino) DEVE ser propagado até o ponto
  de envio, para resolver o `message_thread_id` por feature. Hoje o
  `TelegramChannel` recebe um `forumTopicId` **fixo no construtor** e o `send()`
  não conhece a feature — o desenho DEVE mudar para passar `featureId`/metadata no
  envio ou instanciar canal por feature.
- **FR-003**: O sistema DEVE criar o tópico automaticamente na primeira
  notificação da feature e reutilizá-lo depois, persistindo o mapeamento em
  SQLite (tabela + migração versionada) chaveado por
  `(chat/supergroup, projectId, featureId) → message_thread_id`.
- **FR-004**: O mapeamento DEVE ser resolvido **antes** do primeiro `send`
  (ex.: `run:start`), para essa primeira mensagem não vazar para o fluxo default.
- **FR-005**: O nome do tópico DEVE conter o ID e o título da feature,
  sanitizado para os limites da API (reusar `notify/sanitize.ts`).
- **FR-006**: O sistema DEVE garantir no máximo um tópico ativo por feature,
  inclusive entre reruns.
- **FR-007**: Quando o destino não suportar fóruns **ou** o bot não tiver
  permissão para criar tópico (403, bot não-admin), o sistema DEVE fazer fallback
  para envio sem `message_thread_id` e registrar aviso único e acionável.
- **FR-008**: Criação/uso de tópicos DEVE tratar rate limit (429) e erros
  transitórios com retry/backoff sem interromper a execução da feature.
- **FR-009**: A configuração DEVE permitir definir o supergroup de destino e
  ligar/desligar o roteamento por tópico.
- **FR-010**: Em `thread not found`, o sistema DEVE recriar o tópico e atualizar
  o mapeamento; se o chat/supergroup de destino mudar na config, os mapeamentos
  do destino antigo DEVEM ser tratados como órfãos e recriados no novo destino.

### Key Entities
- **Notification Channel (Telegram)**: estende o atual para resolver o
  `message_thread_id` a partir da feature.
- **Feature Topic Mapping**: persistência de `featureId → message_thread_id`
  (banco/config), para reuso e detecção de tópico perdido.
- **Notification Router**: decide o tópico de destino por feature antes do envio.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Com N features em paralelo, 100% das mensagens de cada feature
  chegam no seu tópico dedicado (0 vazamento entre tópicos).
- **SC-002**: Reexecutar a mesma feature reutiliza o tópico existente em 100% dos
  casos (0 tópicos duplicados).
- **SC-003**: Destinos sem suporte a fórum continuam recebendo 100% das
  notificações no fluxo único (fallback verificado).
- **SC-004**: Erros de rate limit na criação de tópico não abortam nenhuma run
  (retry bem-sucedido ou degradação graciosa).

## Assumptions
- O `chatId` de destino é um supergroup com "Topics" habilitado; o suporte a
  `message_thread_id` já existe em `TelegramChannel` e será estendido para
  resolução por feature.
- O mapeamento `feature → topic` é persistido junto ao catálogo/estado (SQLite).
- A criação de tópico usa `createForumTopic` da Bot API; permissões do bot
  (admin no supergroup) são pré-requisito de setup, documentado no wizard (F21).
