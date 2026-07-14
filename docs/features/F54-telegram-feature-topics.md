# F54 — Telegram: um tópico por feature

Notificações que carregam `featureId` usam um tópico próprio no supergrupo do
Telegram. O tópico é criado sob demanda, identificado pelo ID estável da
feature e reutilizado em novas tentativas, etapas, retomadas e reinícios.

## Configuração

O destino deve ser um supergrupo com tópicos habilitados (`is_forum: true`). O
bot precisa ser administrador com permissão para criar e gerenciar tópicos e
publicar mensagens. Um grupo comum, um canal sem fórum ou permissões
insuficientes produzem um erro persistido e acionável; mensagens de feature não
são redirecionadas para General nem para outra feature.

`forumTopicId` continua disponível para mensagens sem `featureId`, preservando
o destino geral/legado. `telegramChatId` continua sendo aceito como atalho de
configuração legado. Credenciais e IDs permanecem fora do estado exposto pelo
dashboard.

## Ciclo de vida e recuperação

Cada associação é única por `(chatId, featureId)` e guarda o `threadId`, título
inicial, estado, lease de criação e último erro no SQLite. Uma falha de criação
ou entrega fica registrada para diagnóstico e nova tentativa.

Se o Telegram informar que o tópico armazenado foi removido ou ficou
indisponível, a associação é invalidada, um tópico é recriado para a mesma
feature e a mensagem original é tentada novamente uma vez. Falhas não
controladas permanecem como erro; nenhuma mensagem usa o tópico General ou o
tópico de outra feature como fallback.

## Respostas interativas

O poller valida o chat e o `message_thread_id` de mensagens e callback queries.
Uma aprovação, decisão ou entrada só altera a solicitação pendente cujo
`featureId` possui aquela associação ativa. Contextos ausentes ou divergentes
são ignorados; callbacks são reconhecidos quando possível para não deixar a
interface do Telegram carregando indefinidamente.

## Validação determinística

Use o quickstart da feature com `MSQ_DB_PATH` apontando para um banco isolado.
As suites focadas mockam `getChat`, `createForumTopic`, `sendMessage` e o
poller; a inspeção do SQLite deve confirmar uma linha ativa por feature e os
erros persistidos nos cenários incompatíveis.
