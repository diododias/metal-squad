# Plano de correção: notificação Telegram em session-limit + retomada por outro adapter (opção 2B)

> **Status:** rascunho de planejamento  
> **Escopo:** `metal-squad` — notificação de `run:failed` causado por `session limit reached` e ação de retomada com outro adapter via Telegram  
> **Decisão arquitetural:** opção **2B** — ação assíncrona processada pelo daemon/web server, sem manter o processo `msq run` preso esperando decisão.

---

## 1. Contexto

Hoje, quando um adapter atinge o limite de sessão, o `msq` detecta a causa (`session limit reached`), mas trata a falha como genérica:

- O adapter retorna `RunResult { ok: false, blocked: true, summary: 'session limit reached: ...' }`.
- `src/core/runner/execute.ts` não trata `res.blocked` como uma condição especial: conta como falha normal, aplica retry/fallback e, se esgotar, emite `run:failed`.
- `src/core/events/notifications.ts` envia apenas:
  ```
  metal-squad: F-4HGA24AJ failed — session limit reached: session limit
  ```

O front já oferece a ação de retomar com outro adapter ("Resume with another tool" / "continue with tool"). O Telegram deveria fazer o mesmo: informar o limite e sugerir/ permitir continuar com outro adapter.

---

## 2. Objetivos

1. A notificação de `session limit` no Telegram deve ser clara sobre a causa e sugerir explicitamente continuar com outro adapter.
2. A notificação deve permitir que o operador toque um botão no Telegram para retomar a mesma pipeline com outro adapter.
3. A retomada deve acontecer de forma assíncrona, sem prender o processo `msq run` original.
4. A ação via Telegram deve ser segura: verificar disponibilidade do adapter, evitar duplicidade e registrar a operação.

---

## 3. Decisão arquitetural: opção 2B

A opção **2B** foi escolhida porque mantém o modelo operacional atual (`msq run` termina e o usuário pode retomar depois), não introduz processos presos aguardando aprovação e aproveita o daemon/web server como ponto de escuta contínuo do Telegram.

### 3.1 Por que não 2A

A opção 2A (manter `msq run` bloqueado em estado de aprovação) é mais interativa durante a execução, mas:

- exige que o processo `msq run` fique rodando indefinidamente até aprovação, igual a gates/approvals;
- session limit costuma ser um bloqueio externo temporário: o operador pode querer deixar falhar e retomar depois, sem manter uma sessão ativa;
- o front já tem a UI de "resume with another tool" para pipelines pausadas/falhadas; basta expor a mesma ação no Telegram.

### 3.2 Implicação de 2B

O daemon/web server (`msq daemon start` / `msq web`) passa a ser o responsável por escutar e responder ações do Telegram quando o processo `msq run` já terminou. Isso exige:

- iniciar o Telegram poller no daemon;
- deduplicar callbacks para evitar que `msq run` e daemon processem o mesmo update quando ambos estiverem ativos;
- garantir fallback textual quando o daemon não estiver rodando.

---

## 4. Mudanças técnicas

### 4.1 Entrega 1 — melhorar a mensagem de notificação (quick win)

Antes de adicionar botões, a mensagem de `run:failed` já deve ser informativa.

#### 4.1.1 Evento `run:failed`

Em `src/core/events/types.ts`:

```ts
export interface RunFailedEvent {
  runId: number;
  featureId: string;
  featureName?: string;
  tool: Tool;
  error: string;
  kind: RunFailedKind;
  pipelineId?: number | null;
  blocked?: boolean;
}
```

#### 4.1.2 Propagar pipelineId e blocked

Em `src/core/runner/execute.ts`, nos três pontos que emitem `run:failed`, incluir `pipelineId` e `blocked: res.blocked` quando aplicável.

#### 4.1.3 Mensagem de notificação no Telegram

Em `src/core/events/notifications.ts`, no subscriber de `run:failed`:

1. Detectar se `error` começa com `session limit reached:` ou se `blocked === true`.
2. Recuperar `pipelineId` do evento ou via `getRun(runId)?.pipeline_id`.
3. Listar adapters registrados e disponíveis via `resolveRuntimeConfig().tools` e `getAdapter(tool).isAvailable()`.
4. Montar mensagem:
   ```
   metal-squad: F-4HGA24AJ failed — adapter opencode hit session limit: session limit
   To continue with another adapter, run:
   msq resume 123 --tool claude
   Available tools: claude, codex
   ```
5. Incluir `reply_markup` com botões inline "Resume with <tool>" se houver `pipelineId` e tools disponíveis.

### 4.2 Entrega 2 — poller no daemon + handler de callback

#### 4.2.1 Iniciar Telegram poller no daemon/web server

Em `src/web/server.ts` (ou ponto de entrada do daemon), chamar `startTelegramPoller()` no boot e `stopTelegramPoller()` no shutdown.

> Nota: hoje o poller é um singleton em memória (`activePoller`). Como daemon e `msq run` rodam em processos separados, cada um terá seu próprio singleton. A deduplicação no SQLite resolve conflitos.

#### 4.2.2 Deduplicação de callbacks no SQLite

Em `src/db/index.ts`:

```sql
CREATE TABLE IF NOT EXISTS processed_callback_queries (
  callback_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  payload TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Em `src/db/repo.ts`:

```ts
export function recordCallbackProcessed(callbackId: string, action: string, payload?: unknown): boolean;
export function isCallbackProcessed(callbackId: string): boolean;
```

A inserção usa `INSERT OR IGNORE`; retorna `true` se a linha foi inserida (primeiro processador), `false` se já existia.

#### 4.2.3 Handler no Telegram poller

Em `src/core/notify/telegram-poller.ts`:

Adicionar regex:

```ts
const RESUME_OVERRIDE_CMD = /^resume_override:(\d+):([a-z]+)$/i;
```

Ao receber um callback:

1. Se `callbackId` já foi processado (`isCallbackProcessed`), chamar `answerCallback` e ignorar.
2. Se não, tentar marcar como processado (`recordCallbackProcessed`). Se outro processo já processou, ignorar.
3. Extrair `pipelineId` e `tool`.
4. Validar pipeline resumível (`findResumablePipeline(String(pipelineId))`).
5. Validar adapter disponível (`getAdapter(tool).isAvailable()`).
6. Se inválido, enviar notificação/notice e não retomar.
7. Se válido, spawnar `msq resume <pipelineId> --tool <tool>`:
   ```ts
   const entrypoint = process.argv[1];
   const args = [...process.execArgv, entrypoint, 'resume', String(pipelineId), '--tool', tool];
   spawn(process.execPath, args, { detached: true, stdio: 'ignore', cwd: pipeline.cwd });
   ```
8. Responder ao callback com `answerCallback`.

Reaproveitar a lógica existente de `resumeWithOverride` em `src/web/server.ts` como referência, mas encapsular em `src/core/notify/resume-override.ts` para ser chamada tanto pelo web quanto pelo poller.

#### 4.2.4 Função compartilhada de retomada com override

Criar `src/core/notify/resume-override.ts`:

```ts
export function resumePipelineWithOverride(
  pipelineId: number,
  tool?: Tool,
  model?: string,
  effort?: Effort,
): void;
```

Responsabilidades:

- validar pipeline e cwd;
- validar disponibilidade do adapter;
- spawnar `msq resume <pipelineId> --tool <tool> --model <model> --effort <effort>`;
- emitir `ui:info` ou `ui:notice`.

Essa função pode ser chamada tanto pelo poller quanto pelo web server, evitando duplicação de lógica de spawn.

### 4.3 Entrega 3 — coordenação de pollers

#### 4.3.1 Problema

Quando `msq run` está ativo (processo de execução) e o daemon também está rodando, ambos escutam o mesmo bot do Telegram. Se um callback de `resume_override` chegar durante uma execução, ambos tentarão processá-lo.

#### 4.3.2 Solução

A deduplicação no SQLite (Entrega 2.2) já resolve o problema de ação duplicada. Para tornar a arquitetura mais previsível:

- O daemon sempre inicia o poller.
- `msq run` e `msq ui` continuam iniciando o poller localmente, mas **apenas** para responder ações relacionadas a execuções ativas (gates, stage approvals, inputs, timeouts). Ações de retomada pós-execução (`resume_override`) são delegadas ao daemon via SQLite deduplicação.

Em outras palavras: a deduplicação é a fonte de verdade. Quem primeiro registrar o callback_id executa a ação; o outro ignora.

### 4.4 Entrega 4 — registrar ação e melhorar observabilidade

- `recordRunEvent` pode registrar o evento de retomada via Telegram (`source: 'telegram'`, `tool: '...'`).
- `msqEventBus.emit('ui:info', { message: 'Resuming F-4HGA24AJ with claude via Telegram' })` para feedback no web/TUI.

---

## 5. Fluxo de dados

```
1. adapter retorna blocked=true (session limit)
2. runner finaliza run como failed, pipeline como failed
3. runner emite run:failed { runId, featureId, tool, error, pipelineId, blocked: true }
4. notifications.ts detecta session limit
   ├── monta mensagem com sugestão de adapters
   └── envia dispatch('run:failed', message, { reply_markup: [...botões resume_override] })
5. Telegram entrega mensagem com botões
6. usuário toca "Resume with claude"
   └── callback_data: resume_override:123:claude
7. daemon (ou msq run/ui) recebe update via Telegram poller
8. poller tenta deduplicar no SQLite
   ├── se já processado → ignore
   └── senão → marcar como processado
9. poller valida pipeline e adapter
10. poller chama resumePipelineWithOverride(123, 'claude')
11. poller spawna msq resume 123 --tool claude
12. nova execução retoma o pipeline com override pontual
```

---

## 6. Arquivos afetados

| Camada | Arquivo | Mudança |
|--------|---------|---------|
| Eventos | `src/core/events/types.ts` | Adicionar `pipelineId` e `blocked` ao `RunFailedEvent` |
| Runner | `src/core/runner/execute.ts` | Propagar `pipelineId` e `blocked` nos emites de `run:failed` |
| Notificações | `src/core/events/notifications.ts` | Detectar session limit; montar mensagem sugestiva; adicionar `reply_markup` |
| Notify | `src/core/notify/resume-override.ts` | Nova função compartilhada de retomada com override |
| Notify | `src/core/notify/telegram-poller.ts` | Handler de `resume_override:<pipelineId>:<tool>` + deduplicação |
| DB | `src/db/index.ts` | Migration `processed_callback_queries` |
| DB | `src/db/repo.ts` | Queries de deduplicação |
| Web/Daemon | `src/web/server.ts` | Iniciar/parar Telegram poller no boot/shutdown |
| Daemon | `src/commands/daemon.ts` | Garantir que o web server iniciado pelo daemon tenha poller ativo |
| Tests | `tests/events/notifications.test.ts` | Novo: mensagem de session limit e reply_markup |
| Tests | `tests/db/repo.test.ts` | Deduplicação de callbacks |
| Tests | `tests/notify/telegram-poller.test.ts` | Handler de resume_override |
| Tests | `tests/web/server.test.ts` ou similar | Poller no daemon |

---

## 7. Testes

### 7.1 Unitários

- `notifications.test.ts`:
  - Dado `run:failed` com `error: 'session limit reached: session limit'`, a mensagem deve conter a causa, o pipelineId e a sugestão de comando.
  - Deve listar apenas adapters disponíveis.
  - Deve incluir `reply_markup` com botões quando houver pipelineId.

- `repo.test.ts`:
  - `recordCallbackProcessed` retorna `true` na primeira inserção e `false` na segunda.
  - `isCallbackProcessed` retorna estado correto.

- `telegram-poller.test.ts`:
  - Callback `resume_override:123:claude` dispara `resumePipelineWithOverride` se pipeline e adapter forem válidos.
  - Callback duplicado é ignorado após deduplicação.
  - Callback com adapter inválido/indisponível não spawna processo.

- `resume-override.test.ts`:
  - Valida pipeline e adapter antes de spawnar.
  - Chama `spawn` com os argumentos corretos.

### 7.2 Validação live

- Simular session limit (usando um adapter mock ou forçando a mensagem no output).
- Verificar que a notificação no Telegram chega com botões.
- Tocar um botão e verificar que `msq resume <pipelineId> --tool <tool>` é executado.
- Confirmar que a pipeline retoma com o adapter escolhido.

---

## 8. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Dois processos (`msq run` + daemon) processam o mesmo callback | Deduplicação no SQLite com `callback_id` como chave primária |
| Daemon não está rodando | A mensagem textual já instrui o comando manual; botões aparecem, mas não fazem nada sem daemon |
| Adapter escolhido não disponível | Verificar `isAvailable()` antes de spawnar; notificar erro sem criar run |
| Pipeline não está mais resumível | `findResumablePipeline` valida; notificar erro se não for resumível |
| Mensagem fica grande | Limitar a lista de adapters disponíveis; usar `reply_markup` em vez de texto longo |
| Quebra de compatibilidade com eventos existentes | `pipelineId` e `blocked` são opcionais no evento; handlers antigos continuam funcionando |

---

## 9. Checklist de execução

- [x] Entrega 1: melhorar mensagem de notificação
  - [x] Adicionar `pipelineId` e `blocked` ao `RunFailedEvent`
  - [x] Atualizar emites de `run:failed` em `execute.ts`
  - [x] Detectar session limit e montar mensagem sugestiva em `notifications.ts`
  - [x] Testes em `tests/core/events-notifications.test.ts`
- [x] Entrega 2: ação via Telegram
  - [x] Migration `processed_callback_queries` em `src/db/index.ts`
  - [x] Queries de deduplicação em `src/db/repo.ts`
  - [x] Criar `src/core/notify/resume-override.ts`
  - [x] Adicionar handler `resume_override` no `telegram-poller.ts`
  - [x] Iniciar poller no daemon/web server (via `createWebServer`, reaproveitado pelo `msq daemon start` que spawna `msq web`)
  - [x] Testes de poller, deduplicação e resume-override
- [x] Entrega 3: coordenação
  - [x] Validar comportamento quando `msq run` e daemon estão ambos ativos — resolvido pela deduplicação em `processed_callback_queries` (quem inserir primeiro processa; o outro só responde o callback e ignora)
  - [x] Ajustar mensagens de erro para usuário quando daemon não está rodando — a mensagem textual do Telegram já traz o comando `msq resume <pipeline> --tool <adapter>` como fallback manual quando não há daemon ativo para processar o botão
- [x] Entrega 4: observabilidade
  - [x] Registrar evento de retomada via Telegram (`recordRunEvent(runId, 'resume_override', { source: 'telegram', tool })` em `resume-override.ts`, associado ao run mais recente do pipeline via `getLatestRunForPipeline`)
  - [x] Emitir `ui:info` no web/TUI
- [x] Baseline
  - [x] `rtk npm run build`
  - [x] `rtk npm test` (110 arquivos / 1462 testes)
  - [x] `rtk npm run typecheck`
  - [x] `rtk npm run lint`
- [ ] Validação live
  - [ ] Simular session limit e responder via Telegram
  - [ ] Confirmar retomada com adapter alternativo

---

## 10. Próximos passos

1. Validar se a deduplicação no SQLite é suficiente ou se preferimos desligar o poller em `msq run` quando o daemon está ativo.
2. Decidir se a mensagem textual deve ser a entrega mínima isolada (Fase 1) antes de implementar a ação via botão.
3. Criar a branch de trabalho a partir de `develop` e começar pela Entrega 1.
