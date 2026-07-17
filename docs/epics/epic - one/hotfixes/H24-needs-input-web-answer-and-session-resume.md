# H24 — Responder pergunta da IA custava sessão nova; web não conseguia responder conteúdo real

**Tipo**: Hotfix
**Status**: Concluído
**Prioridade**: Alta
**Descoberto em**: 2026-07-15
**Comando observado**: qualquer stage que emite `MSQ_INPUT_REQUIRED:` (`needs_input`),
nos 3 adapters (`claude`, `codex`, `opencode`).

## Problema

Pedido do usuário: quando a IA levanta uma pergunta de esclarecimento durante
um stage, a notificação (Telegram ou web) deveria permitir responder sem
precisar "iniciar uma nova sessão", já que isso é ineficiente e consome
tokens desnecessariamente.

Investigação encontrou dois problemas distintos, ambos afetando esse fluxo:

1. **Web dashboard não conseguia responder pergunta com conteúdo real.**
   `GatesPage.tsx` e `RunDetailPage.tsx` só ofereciam
   Advance/Retry/Hold — semântica de aprovação de gate — para *qualquer*
   `stage_requests` pendente, inclusive `kind: 'input'` (pergunta real do
   `specify` e outros stages). O texto da pergunta e as opções extraídas
   pela IA (adicionadas em F47 para os botões do Telegram) nunca chegavam
   ao client: a query SQL de `RunSummary` (`listRunsForTui`, usada tanto
   pelo web quanto pela TUI aposentada) nunca selecionava a coluna
   `stage_requests.options`, e `stageRequestToPendingApproval`
   (`src/web/state.ts`) descartava tanto `kind` quanto `options` ao montar
   a lista genérica de gates. Telegram já respondia corretamente
   (F47/spec `012-telegram-interactive-questions`, todas as tasks
   concluídas) — o gap era específico da web.

2. **Responder a pergunta sempre custava uma sessão nova no adapter,
   independente do canal.** Em `executeStagedFeature`
   (`src/core/runner/execute.ts`), `nextStageSession` é zerado
   incondicionalmente logo após cada stage run (linha ~908), antes mesmo de
   checar `needs_input`. Quando a pergunta é respondida e o stage é
   re-executado (`index -= 1; continue`), o adapter sempre reabre uma sessão
   do zero — descartando o contexto já pago (`res.session`) — em vez de
   reaproveitar a mesma política de resume-vs-nova-sessão já usada em
   transições normais de stage (`decideStageTransition`,
   `src/core/workflow/sessionPolicy.ts`). Como esse ponto é compartilhado
   pelos 3 adapters, o desperdício de tokens era uniforme entre
   `claude`/`codex`/`opencode`.

O mecanismo de notificar+responder-sem-`msq resume` já existia
(`waitForStageRequestResponse` faz polling in-process; Telegram e o WS do
web já resolvem `stage_requests` sem precisar de um novo processo `msq`) —
o que faltava era (1) a web ter UI para responder com o conteúdo certo e
(2) a resposta não forçar sessão nova no adapter.

## Fix

- `src/core/runner/execute.ts`: no branch `needs_input` de
  `executeStagedFeature`, após receber a resposta, chama
  `decideStageTransition({ nextStage: stage, previousSession: res.session, ... })`
  (mesma função usada nas transições normais) para decidir resume vs. nova
  sessão, em vez de forçar `nextStageSession = undefined`.
- `src/db/repo.ts`: `RunSummary`/`listRunsForTui` passam a selecionar
  `psr.options AS pendingStageRequestOptions` e desserializar o JSON (mesmo
  padrão de `getStageRequest`/`listPendingStageRequests`).
- `src/ui/hooks/useGates.ts`: `PendingApproval` ganha `requestKind` (`'approval' | 'input'`)
  e `options?: string[]`, opcionais, específicos de itens `kind: 'stage'`.
- `src/web/state.ts`: `stageRequestToPendingApproval` propaga `sr.kind` e
  `sr.options` para o `PendingApproval`.
- `src/web/client/components/feedback/QuestionBanner.tsx` (novo): banner que
  mostra o texto real da pergunta e, quando há opções discretas, um botão
  por opção; caso contrário, um campo de texto livre — envia a resposta via
  `action:resolveStageRequest`.
- `src/web/client/pages/RunDetailPage.tsx` e `GatesPage.tsx`: quando
  `pendingStageRequestKind`/`requestKind === 'input'`, renderizam
  `QuestionBanner` em vez do banner Advance/Hold/Retry.

## Arquivos

- `src/core/runner/execute.ts` — `executeStagedFeature`
- `src/db/repo.ts` — `RunSummary`, `listRunsForTui`
- `src/ui/hooks/useGates.ts` — `PendingApproval`
- `src/web/state.ts` — `stageRequestToPendingApproval`
- `src/web/client/components/feedback/QuestionBanner.tsx` (novo)
- `src/web/client/pages/RunDetailPage.tsx`
- `src/web/client/pages/GatesPage.tsx`

## Fora de escopo

- Telegram: já cobria o conteúdo real da pergunta (F47); nenhuma mudança
  necessária.
- `listPipelineOverviews` (board de pipelines) não foi estendido com
  `options` — não alimenta nenhuma UI de resposta a pergunta hoje.
