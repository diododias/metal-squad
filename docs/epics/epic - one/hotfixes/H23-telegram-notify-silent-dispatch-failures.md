# H23 — Falha de entrega no Telegram (F54) ficava completamente muda

**Tipo**: Hotfix
**Status**: Concluido (parte de codigo); acao pendente do operador no Telegram
**Prioridade**: Alta
**Descoberto em**: 2026-07-15
**Comando observado**: qualquer evento notificavel (`run:start`, `gate:created`,
`stage:approval`, `stage:input`, `run:failed`, `run:done`, `budget:alert`,
`timeout:approval-created`) apos F54 (`018-telegram-feature-topics`, commit
`b078004`, 2026-07-14).

## Problema

Desde F54, toda notificacao com `featureId` passou a exigir a criacao/reuso
de um topico de forum no Telegram (`createForumTopic`) antes do envio. No
ambiente do operador, o bot `@openclaw_diodo_bot` estava apenas como
`member` no supergrupo configurado (`-1004444276777`), sem permissao
"Manage Topics" — a API do Telegram exige que o bot seja `administrator`
com essa permissao para chamar `createForumTopic`. Resultado: toda tentativa
desde `2026-07-14 17:01:50` falhou com
`createForumTopic: Bad Request: not enough rights to create a topic`
(9 features distintas registradas com `state='error'` em
`feature_topic_associations`), e **nenhuma notificacao chegou**.

O diagnostico so foi possivel inspecionando `feature_topic_associations`
diretamente no SQLite, porque a falha era inteiramente silenciosa:
`dispatch()` (`src/core/notify/manager.ts`) usava `Promise.allSettled` sem
logar rejeicoes exceto quando `metadata.timeoutApprovalRequestId` estava
presente, e cada assinatura em `src/core/events/notifications.ts` engolia o
erro com `.catch(() => { /* ignore dispatch errors */ })`.

## Causa raiz

Duas causas distintas:

1. **Operacional (fora do codigo)**: bot sem permissao de admin/"Manage
   Topics" no grupo do Telegram configurado. Isso e comportamento
   especificado em F54 (nao ha fallback para General nem para outra
   feature) — a acao corretiva e do operador, no cliente Telegram.
2. **Observabilidade (bug real)**: nenhuma camada do pipeline de
   notificacao logava falha de entrega. Um erro de permissao, token
   invalido, rede fora do ar, etc. desaparecia sem deixar rastro em log,
   exigindo inspecao manual do SQLite para diagnosticar.

## Fix

- `src/core/notify/manager.ts#dispatch`: apos `Promise.allSettled`, cada
  resultado `rejected` agora gera
  `console.error('[notify] channel delivery failed: <canal> (<evento>)', reason)`,
  independente do branch de `timeoutApprovalRequestId`.
- `src/core/events/notifications.ts`: cada `.catch(() => { /* ignore
  dispatch errors */ })` (uma por assinatura: `run:start`, `gate:created`,
  `stage:approval` auto/manual, `stage:input`, `timeout:approval-created`,
  `run:failed`, `budget:alert`, `run:done`) agora loga
  `console.error('[notify] <evento> dispatch failed:', error)` antes de
  engolir o erro — o event bus continua nao sendo derrubado.

Nao houve mudanca em `telegram-topics.ts` nem no fluxo de
erro/estado (`recordFeatureTopicAssociationError`,
`invalidateFeatureTopic`) — esse comportamento esta correto e foi o que
permitiu o diagnostico via SQLite.

## Arquivos

- `src/core/notify/manager.ts` — `dispatch`
- `src/core/events/notifications.ts` — `attachEventNotifications`

## Fora de escopo

- Promover o bot a administrador no Telegram (acao do operador, nao e
  codigo).
- Limpeza das linhas `state='error'` em `feature_topic_associations`: nao e
  necessaria, `createOrResolveFeatureTopic` tenta de novo automaticamente a
  cada chamada quando o estado nao e `active`.
