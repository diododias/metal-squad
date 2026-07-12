# Research: Perguntas Interativas via Telegram (Botoes)

## Estado atual do codigo (nao "unknowns" de tecnologia — mapeamento de pontos de integracao)

Esta feature nao introduz nova stack; o trabalho de pesquisa aqui e mapear os
pontos de codigo existentes que ja resolvem parte do problema (H19 esta mais
avancado do que o doc do hotfix sugere) e decidir o design dos pontos que
faltam.

### Decision: H19 (deteccao pergunta vs aprovacao) ja existe via contrato `MSQ_INPUT_REQUIRED:`

- **Onde**: `src/core/runner/execute.ts:761` injeta no prompt de cada stage a
  instrucao `If you need admin input, end your final response with exactly:
  MSQ_INPUT_REQUIRED: <question>`. `src/core/adapters/control.ts`
  (`parseControlSignal`) reconhece esse marcador no output do adapter e
  retorna `{ type: 'needs_input', prompt }` em `RunResult.control`
  (`src/core/adapters/types.ts`). `executeStagedFeature`
  (`src/core/runner/execute.ts:619`) usa `res.control?.type === 'needs_input'`
  para criar um `stage_requests` row com `kind: 'input'`, em vez do fluxo de
  aprovacao (`kind: 'approval'`, criado em outro ponto do mesmo loop quando
  nao ha `needs_input`).
- **Rationale**: a spec assume H19 resolvido (Assumption #1); o codigo
  confirma que o roteamento pergunta-vs-aprovacao ja e estrutural (dois
  `kind` distintos, dois caminhos de notificacao em
  `src/core/events/notifications.ts`). O que falta de H19 e apenas o
  problema secundario — truncamento de mensagem — que esta feature cobre via
  FR-006.
- **Alternatives considered**: reabrir H19 como pre-requisito bloqueante
  separado. Rejeitado — o mecanismo de deteccao ja funciona
  (`tests/runner/execute.test.ts:679` cobre esse caminho); nao ha trabalho
  adicional de "deteccao" a fazer, apenas extrair opcoes do texto da pergunta
  ja roteada corretamente.

### Decision: formato de opcoes sera um bloco `OPTIONS:` apos o texto da pergunta, dentro do mesmo `MSQ_INPUT_REQUIRED:`

- **Onde**: convencao de output a ser instruida no `buildStagePrompt`
  (`src/core/runner/execute.ts`), parseada em `parseControlSignal`
  (`src/core/adapters/control.ts`).
- **Formato**:
  ```
  MSQ_INPUT_REQUIRED: <texto da pergunta>
  OPTIONS:
  - <rotulo opcao 1>
  - <rotulo opcao 2>
  - <rotulo opcao 3>
  ```
- **Rationale**: `parseControlSignal` ja captura tudo apos a ultima
  ocorrencia do prefixo como uma unica string multi-linha (testado em
  `tests/core/control.test.ts:60`, "handles multiline prompts"). Um marcador
  de linha exclusiva (`OPTIONS:`) e trivial de parsear sem exigir JSON no
  output da IA (formato ja e texto livre orientado por instrucao de prompt,
  nao um formato estruturado tipo JSON — mais robusto a variacao de output
  entre `claude`/`codex`/`opencode`). Quando o bloco nao existe ou nao
  parseia, o comportamento de hoje (prompt = texto integral, sem opcoes) e
  preservado — nenhum teste existente que usa apenas `MSQ_INPUT_REQUIRED:`
  sem `OPTIONS:` muda de resultado.
- **Alternatives considered**: pedir a IA para responder em JSON
  (`{"question": ..., "options": [...]}`). Rejeitado — adapters diferentes
  (claude/codex/opencode) tem taxas de aderencia a formato JIT distintas;
  texto livre com marcador de linha e mais tolerante a variacao e mais facil
  de instruir via prompt curto.

### Decision: fallback para texto livre e "tudo ou nada" nos limites da opcao

- **Rationale**: Telegram inline keyboard tem limite rigido de 64 bytes para
  `callback_data` (nao usamos o rotulo inteiro no callback — ver decisao de
  callback abaixo — entao esse limite nunca e o gargalo). O limite pratico
  relevante e de legibilidade/UX do botao (rotulo longo quebra a UI do
  Telegram) e de quantidade de opcoes (muitos botoes empilhados sao piores
  que texto livre). Definimos constantes conservadoras
  (`MAX_OPTIONS = 8`, `MAX_OPTION_LABEL_LENGTH = 60`) verificadas em
  `parseControlSignal`: se qualquer opcao excede o limite de tamanho, ou a
  contagem excede o maximo, ou nenhuma opcao valida foi extraida, o parser
  nao popula `options` (undefined) e o fluxo de notificacao ja cai
  naturalmente no formato de texto livre existente (ver decisao de
  notificacao abaixo) — sem novo codigo de "modo fallback", e o
  comportamento padrao quando `options` esta ausente.
- **Alternatives considered**: abreviar rotulos individualmente e manter
  parte das opcoes como botoes. Rejeitado pela spec (Edge Cases,
  linha 64: "abreviar... ou cair para texto livre" sao alternativas
  equivalentes) — abreviar quebra o requisito FR-003 de que o rotulo do
  botao deve corresponder ao "conteudo real da opcao gerada pela IA"; cair
  para texto livre e mais simples e nao viola FR-003 nem introduz
  ambiguidade.

### Decision: `callback_data` usa indice, nao o rotulo da opcao

- **Onde**: `src/core/events/notifications.ts` (montagem do
  `reply_markup`), `src/core/notify/telegram-poller.ts` (parsing do
  callback).
- **Formato**: `input:<requestId>:<optionIndex>` (dois-pontos separando os
  dois numeros), distinto do comando de texto livre existente
  `input:<requestId> <texto>` (espaco separando id de texto arbitrario) —
  os dois regexes nao colidem porque um exige um numero puro apos o segundo
  separador e o outro aceita qualquer caractere.
- **Rationale**: `callback_data` do Telegram tem limite de 64 bytes; um
  rotulo de opcao (ate 60 chars permitidos) mais o prefixo `input:<id>:`
  poderia estourar esse limite em casos de IDs grandes + rotulo no limite.
  Usar indice mantem o payload sempre pequeno e determinístico. O poller
  resolve o indice para o rotulo real consultando `stage_requests.options`
  (nova coluna) antes de chamar `resolveStageRequest`, preservando o
  requisito FR-004 (o valor propagado ao step e o rotulo real da opcao, nao
  o indice).
- **Alternatives considered**: usar o proprio rotulo truncado no
  `callback_data`. Rejeitado — truncar o rotulo no callback e reconstrui-lo
  no poller e mais fragil (perda de informacao) do que indexar contra a
  lista persistida.

### Decision: opcoes persistidas em `stage_requests.options` (nova coluna `TEXT` JSON, nullable)

- **Onde**: `src/db/index.ts` (migracao `ALTER TABLE stage_requests ADD
  COLUMN options TEXT`, seguindo o padrao `ensureXColumn` ja usado para
  `pipelines`/`task_runs`/`retry_history`), `src/db/repo.ts`
  (`createStageRequest`, `getStageRequest`, `StageRequestRow`).
- **Rationale**: o poller precisa resolver indice -> rotulo de forma
  confiavel mesmo apos restart do processo (long-poll roda em processo
  separado do runner) — nao da para manter isso so em memoria.
  `stage_requests` ja e a tabela de origem da verdade para pedidos
  pendentes/resolvidos (`getStageRequest`, `resolveStageRequest`) e ja
  segue o padrao de colunas JSON serializadas como TEXT em outras tabelas
  do mesmo arquivo (`pipelines.plan_json`, `backlog_features.data_json`).
- **Alternatives considered**: cache em memoria no processo do poller.
  Rejeitado — poller e runner podem rodar em processos diferentes; nao ha
  garantia de que o mesmo processo que criou o pedido esteja vivo quando o
  callback chega.

### Decision: split de mensagem longa (FR-006) encapsulado dentro de `TelegramChannel.send`

- **Onde**: `src/core/notify/telegram.ts`.
- **Rationale**: o limite de 4096 caracteres por mensagem e uma
  particularidade da Telegram Bot API — nenhum outro canal
  (`slack.ts`, `discord.ts`, `webhook.ts`, `desktop.ts`) tem essa restricao
  documentada no mesmo lugar, e `manager.ts` hoje trata canais de forma
  generica (`ch.send(safeMessage, metadata)`), sem conhecimento de formato
  por canal. Encapsular o split dentro do proprio `TelegramChannel`
  preserva essa fronteira: o canal decide como fatiar sua propria mensagem
  e anexa `reply_markup` (os botoes) apenas ao ultimo fragmento enviado,
  exatamente como FR-006 exige.
  ("O sistema DEVE dividir o conteudo em mensagens sequenciais legiveis,
  com os botoes anexados a ultima mensagem da sequencia").
- **Alternatives considered**: mover a logica de split para `manager.ts`
  (`dispatch()`), tratando-a de forma generica para todos os canais.
  Rejeitado — nenhum outro canal precisa disso hoje e adicionar essa
  responsabilidade ao `manager.ts` violaria a fronteira atual
  (`manager.ts` nao sabe nada sobre formato especifico de mensagem por
  canal; cada `NotificationChannel.send` e responsavel por seu proprio
  protocolo).

## Resumo do que falta implementar (referencia para Phase 1 / tasks)

1. `src/core/adapters/control.ts`: estender `parseControlSignal` para
   extrair `options?: string[]` de um bloco `OPTIONS:` dentro do prompt,
   respeitando os limites de contagem/tamanho.
2. `src/core/adapters/types.ts`: estender `RunControl` (`needs_input`) com
   `options?: string[]`.
3. `src/core/runner/execute.ts`: instruir o formato `OPTIONS:` no
   `buildStagePrompt`; propagar `res.control.options` para
   `createStageRequest`.
4. `src/db/index.ts` + `src/db/repo.ts`: coluna `options` em
   `stage_requests`; `createStageRequest`/`getStageRequest`/
   `StageRequestRow` cientes da nova coluna.
5. `src/core/events/types.ts`: `StageRequestCreatedEvent.options?: string[]`.
6. `src/core/events/notifications.ts`: montar `reply_markup` com um botao
   por opcao (callback `input:<requestId>:<index>`) quando
   `kind === 'input'` e `options` presente; manter o comportamento atual
   (texto livre, sem botoes) quando ausente.
7. `src/core/notify/telegram-poller.ts`: novo regex para
   `input:<id>:<index>`; resolver indice -> rotulo via `getStageRequest`
   antes de chamar `resolveStageRequest`; ignorar index invalido ou pedido
   ja resolvido sem lancar erro.
8. `src/core/notify/telegram.ts`: split de mensagem > 4096 chars em
   fragmentos sequenciais; `reply_markup` so no ultimo fragmento.
