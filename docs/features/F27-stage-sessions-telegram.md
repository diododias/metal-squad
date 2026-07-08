# F27 — Workflow por etapas com sessoes isoladas

**Epic**: [E03 — Orchestration v2](../epics/E03-orchestration-v2.md)
**Prioridade**: Alta
**Esforco**: High
**Depende de**: F15

## Problema

Hoje o `msq` trata uma feature como uma unica execucao de adapter. Isso funciona para um fluxo simples de implementacao, mas nao garante o controle operacional exigido para workflows Spec Kit em etapas.

No fluxo desejado, cada etapa precisa ser sua propria sessao, com checkpoint explicito entre:

- `specify`
- `clarify` quando houver iteracao humana
- `plan`
- `tasks`
- `implement`

Tambem falta um mecanismo para:

- interromper a pipeline ao fim de cada etapa
- pedir aprovacao via Telegram antes de avancar
- capturar respostas do admin quando o `specify` pedir iteracao do usuario
- sincronizar o `tasks.md` gerado para o `backlog.yaml` real do repo

## Validacao do estado atual

O comportamento atual ainda nao atende esse contrato:

- `src/core/runner/execute.ts` cria uma run por feature e chama `runFeature()` uma unica vez por item do backlog.
- `src/core/backlog/prompt.ts` concatena os prompts das skills em um unico payload com `---`, o que mantem varias etapas dentro da mesma sessao do agent.
- `src/core/adapters/claude.ts` detecta stages apenas para observabilidade; nao existe isolamento real entre `specify`, `plan` e `tasks`.
- `src/core/notify/telegram-poller.ts` so entende comandos `gate:<id> ...`; ele nao captura resposta livre do admin nem aprovacao entre etapas.
- `tasks.md` pode ser gerado pelo workflow externo, mas o `backlog.yaml` nao eh atualizado automaticamente para refletir essas tasks.

## Objetivo

Transformar o workflow Spec Kit em uma pipeline orientada a etapas, onde cada etapa roda em uma sessao separada, persiste seu resultado, para explicitamente ao terminar e so avanca para a proxima etapa quando:

- o admin aprovar via Telegram, ou
- uma flag/config de bypass estiver habilitada

Ao final da etapa `tasks`, o `backlog.yaml` deve ser sincronizado automaticamente para deixar as tasks prontas para execucao posterior pelo `msq`.

## Solucao

### 1. Pipeline de etapas isoladas

Cada feature passa a poder declarar um workflow estruturado, por exemplo:

```yaml
workflow:
  mode: staged
  stages:
    - specify
    - plan
    - tasks
    - implement
  approvals:
    channel: telegram
    autoAdvance: false
  syncTasksToBacklog: true
```

Cada `stage` deve virar uma execucao independente do adapter, com seu proprio `runId`/`stageRunId`, output, resumo e status final.

### 2. Checkpoint obrigatorio entre etapas

Quando uma etapa terminar com sucesso, o `msq` nao pode continuar no mesmo processo de agente. Ele deve:

1. persistir o resultado da etapa
2. emitir um evento de etapa concluida
3. mandar mensagem no Telegram perguntando se deve avancar
4. encerrar a etapa atual
5. aguardar decisao explicita ou auto-advance

Esse comportamento precisa valer tambem para a etapa `tasks`.

### 3. Iteracao humana a partir do `specify`

Se o `specify` identificar que precisa de input humano, o fluxo deve abrir uma solicitacao estruturada ao inves de depender de texto solto no terminal.

Contrato esperado:

- a etapa publica um pedido de iteracao com identificador proprio
- o Telegram recebe a pergunta ou lista de perguntas para o admin
- a resposta do admin eh persistida e vinculada a essa solicitacao
- a retomada acontece em uma nova sessao da etapa `specify` ou `clarify`, nunca na sessao anterior

Para isso, o adapter precisa normalizar pedidos de input humano em um evento estruturado, e nao apenas por heuristica textual fragil.

### 4. Bypass configuravel

Deve existir um bypass explicito para ambientes unattended:

- flag CLI: `msq run --auto-advance-stages`
- config global/per-repo: `workflow.autoAdvanceStages: true`

Quando o bypass estiver ativo:

- a aprovacao manual entre etapas eh pulada
- a etapa seguinte inicia em uma nova sessao normalmente
- o historico ainda registra que a etapa foi auto-aprovada

### 5. Sincronizacao de `tasks.md` para `backlog.yaml`

Ao finalizar a etapa `tasks`, o `msq` deve:

- localizar o `tasks.md` ativo da feature
- extrair tasks validas e ordenadas
- atualizar o bloco `tasks:` da feature correspondente em `backlog.yaml`
- manter a operacao idempotente, para reruns nao duplicarem tarefas

O arquivo real do repo hoje eh `backlog.yaml`; o fluxo deve atualizar esse caminho, mesmo que o requisito seja descrito informalmente como `backlog.yml`.

## Escopo tecnico

- `src/core/backlog/schema.ts`
  - adicionar schema de `workflow`/`stages`/`approvals`
- `src/commands/run.ts`
  - adicionar flags para `--auto-advance-stages` e selecao de stage/resume
- `src/core/runner/execute.ts`
  - trocar a execucao monolitica por um loop de etapas com persistencia e pausa entre sessoes
- `src/core/orchestrator/scheduler.ts`
  - manter a ordenacao entre features, mas delegar o controle intra-feature ao runner de stages
- `src/core/adapters/*`
  - suportar boundary explicita por etapa e retorno estruturado para `needs_input`, `stage_done`, `stage_failed`
- `src/core/notify/telegram.ts`
  - enviar mensagens de aprovacao e solicitacoes de iteracao com contexto de etapa
- `src/core/notify/telegram-poller.ts`
  - suportar comandos de aprovacao de etapa e captura de respostas do admin
- `src/db/index.ts` e `src/db/repo.ts`
  - persistir `pipeline_runs`, `stage_runs`, `stage_approvals`, `admin_inputs` e relacao com `runs`
- novo modulo `src/core/backlog/sync.ts`
  - importar `tasks.md` para `backlog.yaml` com escrita deterministica

## Criterios de aceite

- [x] `specify`, `plan`, `tasks` e `implement` rodam em sessoes separadas, com registros distintos no estado persistido.
- [x] O fim de uma etapa nao continua automaticamente na mesma sessao do agent.
- [x] Quando o `specify` pedir iteracao humana, o pedido vai para o Telegram e a resposta do admin fica persistida e reutilizavel.
- [x] A retomada apos input humano acontece em uma nova sessao da etapa apropriada.
- [x] Existe aprovacao manual entre etapas via Telegram.
- [x] Existe bypass por flag/config para auto-advance entre etapas.
- [x] A etapa `tasks` atualiza automaticamente o `backlog.yaml` com as tasks geradas, sem duplicacao.
- [x] `msq status` e a TUI deixam claro em qual etapa a feature esta, se esta aguardando input humano, e se esta aguardando aprovacao para avancar.
- [x] Existem testes cobrindo isolamento de sessoes por etapa, aprovacao manual, auto-advance, captura de input do admin e sincronizacao de `tasks.md` para `backlog.yaml`.
