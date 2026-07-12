# F49 — Continuidade de Sessao ao Responder Pergunta da IA

**Epic**: E-controle-de-sessao (ad-hoc, sem epic formal no roadmap ainda)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: F41 (Reaproveitamento Adaptativo de Sessao entre Steps), F40
(Visualizacao por Step + Workflow Customizavel por Projeto)

## Relato do usuario (2026-07-12)

> Quando a IA levanta uma pergunta durante um step (ainda nao desenvolvido,
> apenas uma duvida de esclarecimento) e o admin responde pelo Telegram, a
> sessao que fez a pergunta nao continua de onde parou — o sistema parece
> iniciar uma sessao nova do zero. O fix deve rodar o tool em segundo plano
> (headless), continuando a mesma sessao, sem ficar reinjetando o contexto
> inteiro do prompt a cada resposta — precisa ser economico em tokens.

## Problema

Hoje, quando um stage termina a resposta com `MSQ_INPUT_REQUIRED: <pergunta>`
(`src/core/runner/execute.ts:761`), o processo do adapter ja saiu (chamada
headless de tiro unico). `executeStagedFeature` marca o run como `blocked`,
cria um `stageRequest` e faz polling ate a resposta chegar
(`src/core/runner/execute.ts:619-632`). Ao responder, o codigo decrementa o
indice do stage para repetir o mesmo stage, mas **zera `nextStageSession`
antes de checar `needs_input`** (`execute.ts:617`) — o `SessionHandle`
retornado pelo adapter em `res.session` e descartado sem necessidade, entao
o proximo run chama o adapter sem `session`, o que gera uma sessao nova
(`randomUUID()` em `src/core/adapters/claude.ts:56-57` e equivalentes em
`codex.ts`/`opencode.ts`).

Alem disso, mesmo se a sessao fosse retomada, `buildStagePrompt`
(`execute.ts:748-779`) remonta o prompt **inteiro** a cada tentativa —
backlog completo + skills + regras do stage — e so acrescenta a resposta do
admin como uma linha extra de texto (`"Admin inputs already collected for
this stage: ..."`, `execute.ts:773-774`). Isso e redundante em tokens
sempre que houver uma sessao retomavel: o tool ja teria esse contexto na
propria sessao.

Importante: o mecanismo de resume headless **ja existe** e ja e usado por
F41 para transicao entre stages — `SessionHandle`/`SessionReuseMode` em
`src/core/adapters/types.ts:17-34`, e cada adapter ja aceita
`session.mode === 'resume'` via flag de CLI (`--resume <id>` no
`claude.ts:63`, `resume <threadId>` no `codex.ts:61-70`, `--session <id>` no
`opencode.ts:82`). Nenhum desses caminhos abre terminal interativo — e
sempre um processo filho spawnado (`runCli`), igual a qualquer run normal.
O problema nao e falta de suporte a resume; e que o ciclo pergunta→resposta
simplesmente nao usa esse suporte, e nem precisaria reenviar o prompt
completo se usasse.

## Objetivo

Quando o admin responde a uma pergunta pendente de um step (por texto livre
hoje, ou por botao apos F47), o sistema deve:

1. Retomar a mesma sessao do adapter que levantou a pergunta (headless, em
   segundo plano, sem abrir nada interativo para o usuario) em vez de abrir
   sessao nova.
2. Enviar como proximo turno **apenas a resposta do admin** (nao o prompt
   completo do stage de novo), reduzindo o consumo de tokens de entrada em
   relacao ao comportamento atual.
3. Cair de volta no comportamento atual (prompt completo + resposta anexada
   como texto, sessao nova) quando nao houver sessao valida para retomar —
   adapter sem suporte, handle ausente, ou resume que falhe na pratica
   (ex.: sessao expirada do lado da ferramenta).

## Solucao (visao macro)

Nao ha ainda mapeamento fino de codigo para "como" exatamente resolver cada
sub-problema (por convencao do fluxo de desenvolvimento deste repo, isso
fica para o proximo passo — specify/plan). Em nivel macro, a mudanca deve
tocar:

### 1. Reaproveitar o `SessionHandle` do run bloqueado

No ciclo de retry por `needs_input` em `executeStagedFeature`, capturar
`res.session` do run que gerou a pergunta e propagar como
`nextStageSession = { mode: 'resume', handle: res.session }` — reusando o
mesmo contrato ja definido por F41 (`SessionHandle`, `SessionReuseMode`),
sem criar um mecanismo paralelo de resume.

### 2. Prompt de retry minimo (economia de tokens)

Quando o proximo run for um resume valido para o mesmo stage, o prompt
enviado deve conter so a resposta do admin (com um preambulo curto, ex.
"Resposta do administrador para a pergunta anterior: <resposta>"), nao
`buildStagePrompt` completo. O prompt completo continua sendo usado: (a) na
primeira tentativa de cada stage, e (b) como fallback quando nao ha sessao
resumivel valida.

### 3. Fallback seguro quando o resume falha

Se o adapter nao suportar resume para aquele tool, ou o handle estiver
ausente/invalido, ou a tentativa de `--resume` falhar na pratica (ex.:
sessao expirada do lado da ferramenta, exit code de erro), o sistema deve
cair de volta no comportamento atual — prompt completo + resposta anexada,
sessao nova — sem falhar o pipeline nem exigir intervencao manual.

### 4. Observabilidade

Registrar se cada resposta a uma pergunta usou resume ou fallback (reusando
a infraestrutura de observabilidade do F41 — `stage_transition_decisions`
ou equivalente) e expor esse estado na TUI/dashboard, para ficar claro que
a execucao "esta retomando em segundo plano" em vez de parecer travada ou
reiniciada do zero. Essa visibilidade depende da visao por step trabalhada
em F40.

## Escopo tecnico (provavel, a confirmar no specify/plan)

- `src/core/runner/execute.ts` — ciclo `needs_input` em
  `executeStagedFeature` (hoje em `~604-632`) e `buildStagePrompt`
  (hoje em `~748-779`)
- `src/core/adapters/{claude,codex,opencode}.ts` — resume ja existe
  (`SessionReuseMode: 'resume'`); avaliar se falha de resume (sessao
  expirada) precisa virar erro recuperavel tratado explicitamente em vez de
  erro generico de exit code
- `src/core/workflow/sessionPolicy.ts` — decisao de reuso ja existe para
  transicao *entre* stages (`decideStageTransition`); avaliar se o resume
  no ciclo pergunta→resposta (mesmo stage, nao proximo stage) reusa essa
  funcao ou precisa de uma decisao irma dedicada
- `src/db/repo.ts` — observabilidade da decisao de resume/fallback no ciclo
  pergunta→resposta
- `src/ui/` e `src/web/static/components/` — exibir o estado "retomando
  sessao em segundo plano" (depende de F40 para a visao por step)

## Riscos e pontos em aberto

- A sessao pode expirar ou ser invalidada entre a pergunta e a resposta do
  admin (o intervalo pelo Telegram pode ser de minutos a horas) — o
  fallback precisa ser testado como caminho normal, nao excecao rara.
- O contrato de resume varia por adapter (`claude --resume <uuid>`,
  `codex resume <threadId>`, `opencode --session <id>`) — confirmar que os
  tres aceitam retomar uma sessao que terminou por output normal (pergunta
  do admin), sem efeitos colaterais inesperados.
- O formato exato do preambulo minimo de retry (so a resposta crua vs. um
  pouco de moldura) e decisao de specify/plan, nao desta spec macro.
- Nao confundir com F47 (troca texto livre por botoes no Telegram): F47 e
  sobre a UI/canal da pergunta; F49 e sobre o que acontece do lado da
  sessao/tool depois que a resposta chega, independente do canal usado.

## Criterios de aceite

- [ ] Ao responder uma pergunta `MSQ_INPUT_REQUIRED` (texto livre hoje, ou
      botao apos F47), o proximo run do mesmo stage usa o resume nativo do
      adapter (`--resume`/`resume`/`--session`, conforme o tool) com o
      `sessionId` da sessao que gerou a pergunta, em vez de abrir sessao
      nova.
- [ ] O prompt enviado nesse resume contem apenas a resposta do admin (nao
      o prompt completo do stage), reduzindo tokens de entrada em relacao
      ao comportamento atual.
- [ ] Quando o resume falha ou nao ha handle valido, o sistema cai de volta
      no comportamento atual (prompt completo + resposta anexada) sem
      falhar o pipeline.
- [ ] A execucao continua 100% headless/em segundo plano — nenhum terminal
      interativo ou sessao visivel e aberto para o usuario durante o
      resume.
- [ ] Observabilidade registra se cada resposta a pergunta usou resume ou
      fallback.
- [ ] Testes cobrindo: resume bem sucedido, resume falho com fallback, e a
      escolha entre prompt minimo vs. prompt completo em cada caso.

## Exemplo de fluxo esperado

1. Stage `specify` roda e termina com
   `MSQ_INPUT_REQUIRED: Qual nome usar para a entidade X?`.
2. O run e marcado `blocked`; o `sessionId` retornado pelo adapter e
   capturado (ex.: `sess-abc123`).
3. O admin responde `"Use EntityX"` pelo Telegram.
4. O proximo run do stage `specify` chama o adapter com
   `session: { mode: 'resume', handle: { sessionId: 'sess-abc123', ... } }`
   e prompt = `"Resposta do administrador: Use EntityX"` — nao o prompt
   completo do stage de novo.
5. A IA continua exatamente de onde parou, com todo o contexto ja presente
   na sessao retomada.
