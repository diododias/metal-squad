# F32 — Web Mode

**Epic**: [E06 — Web Version](../epics/E06-web-version.md)
**Prioridade**: Alta
**Esforco**: High
**Depende de**: F31, F15, F12, F09

## Problema

O `msq` so pode ser controlado e monitorado localmente, pela CLI ou pela TUI (`msq ui`). Nao existe uma forma de acessar o estado das runs, resolver gates ou pausar pipelines de outro dispositivo ou de um ambiente sem terminal interativo. Isso limita a utilidade do orquestrador em cenarios de uso remoto, mobile ou de integracao com outros paineis.

## Objetivo

Adicionar um modo web ao `msq`, acessivel pelo navegador, que replique a interface e as capacidades da TUI na primeira versao. O modo web deve ser isolado da TUI, reaproveitar a camada de dados e o event bus existentes, e oferecer controle remoto completo: visualizar runs, gates, output e dashboard; iniciar, pausar, retomar e abortar runs; resolver gates e stage requests.

## Escopo entregue

### 1. Comandos CLI

- `msq web` inicia o servidor web em foreground.
- `msq web --host <host>` define o bind address (padrao `127.0.0.1`).
- `msq web --port <porta>` define a porta (padrao `8743`).
- `msq web --no-auth` desativa a autenticacao por token (requer confirmacao).
- `msq daemon start` inicia o servidor web em background, detached, gravando o PID em `~/.local/share/metal-squad/daemon.pid`.
- `msq daemon stop` le o PID e encerra o processo daemon.
- `msq daemon status` exibe se o daemon esta rodando, host, porta e PID.
- `msq daemon restart` executa `stop` seguido de `start`.

### 2. Servidor HTTP + WebSocket

- Servidor HTTP embutido usando `node:http`.
- Rota `GET /` serve `src/web/static/index.html`.
- Rota `GET /static/*` serve assets estaticos.
- Rota `GET /api/health` retorna status do servidor (sem autenticacao).
- Rota `GET /api/state` retorna o estado completo do `msq` (com autenticacao).
- Endpoint WebSocket `/ws` e o canal principal: envia eventos em tempo real e recebe acoes do cliente.

### 3. Autenticacao

- Token de autenticacao obrigatorio por padrao.
- Token gerado automaticamente na primeira execucao de `msq web` ou `msq daemon start`.
- Token armazenado preferencialmente no keyring (`@napi-rs/keyring`) sob a conta `msq-web-token`, com fallback para `~/.config/metal-squad/config.json`.
- Cliente envia o token via header `Authorization: Bearer <token>` nas requisicoes HTTP e via primeira mensagem WebSocket `{ type: 'auth', token: '...' }`.
- Requisicoes sem token valido recebem HTTP 401; conexoes WebSocket invalidas sao fechadas com codigo 1008.

### 4. API de estado e eventos

- `GET /api/state` retorna `MsqWebState`, composto por:
  - `repoLabel`
  - `runs` (via `listRunsForTui`)
  - `gates` (via `openGates` + `listPendingStageRequests`)
  - `pendingFeatures` (via `getFeatureCatalog` + `getPendingFeatures`)
  - `runningTasks` (via `listRunningTaskRuns`)
  - estatisticas resumidas
  - dados do dashboard de custos
- O servidor subscreve-se ao `msqEventBus` e retransmite os eventos relevantes para todos os clientes WebSocket conectados:
  - `run:start`, `run:done`, `run:failed`
  - `run:output`
  - `tokens:update`
  - `gate:created`, `gate:resolved`
  - `stage:request-created`, `stage:request-resolved`
  - `task:started`, `task:updated`
  - `ui:info`, `ui:notice`, `budget:alert`

### 5. Acoes de controle via WebSocket

O frontend pode enviar mensagens ao servidor para executar acoes:

- `action:startFeature { featureId }` — inicia uma feature via `msq run --feature <id>` em processo detached.
- `action:pausePipeline { pipelineId }` — chama `pausePipeline`.
- `action:resumePipeline { pipelineId }` — chama `resumePipeline`.
- `action:abortPipeline { pipelineId }` — chama `abortPipeline`.
- `action:requestFeatureAbort { pipelineId, featureId }` — chama `requestFeatureAbort`.
- `action:resolveGate { gateId, decision }` — chama `resolveGate`.
- `action:forceResolveGate { gateId }` — chama `forceResolveGate`.
- `action:resolveStageRequest { requestId, response }` — chama `resolveStageRequest`.
- `subscribe:output { runId }` / `unsubscribe:output { runId }` — controle de stream de output por run.

### 6. Frontend web (clone da TUI)

- React carregado via CDN (`https://esm.sh/react` e `https://esm.sh/react-dom/client`).
- Componentes escritos sem JSX, usando `React.createElement`.
- Interface replica a TUI:
  - Header com nome do repo e estatisticas.
  - Dashboard kanban com colunas (todo / execution / done / canceled).
  - Painel de gates pendentes.
  - Detalhe de run com output, task runs, estagios e controles.
  - Dashboard de custos.
  - Command palette.
  - Toast stack para notificacoes.
  - Help overlay e status bar.
- Atalhos de teclado replicados via event listeners do DOM.
- Comunicacao via WebSocket; atualizacoes aplicadas incrementalmente ao estado local.

### 7. Configuracao

- Nova secao `web` no schema de configuracao:
  - `host`: string, padrao `127.0.0.1`.
  - `port`: number, padrao `8743`.
  - `auth`: `'token' | 'none'`, padrao `'token'`.
- Opcoes de linha de comando sobrescrevem valores do arquivo de configuracao.

### 8. Isolamento da TUI

- Todo o codigo web fica em `src/web/`.
- `src/ui/` nao e modificado.
- A logica de negocio em `src/db/repo.ts`, `src/core/events/` e `src/core/runner/` e reaproveitada sem alteracoes.

## Modelo esperado

```ts
interface MsqWebState {
  repoLabel: string;
  runs: RunSummary[];
  gates: PendingApproval[];
  pendingFeatures: PendingFeature[];
  runningTasks: RunningTaskSummary[];
  stats: {
    totalRuns: number;
    doneRuns: number;
    executionCount: number;
    falhaCount: number;
    tokenStats: TokenStats;
  };
  dashboard: {
    periods: { label: string; days: number | null }[];
    rows: StatsRunRow[];
  };
  notifications: UiNotification[];
}

type WebSocketClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'action:startFeature'; featureId: string }
  | { type: 'action:pausePipeline'; pipelineId: number }
  | { type: 'action:resumePipeline'; pipelineId: number }
  | { type: 'action:abortPipeline'; pipelineId: number }
  | { type: 'action:requestFeatureAbort'; pipelineId: number; featureId: string }
  | { type: 'action:resolveGate'; gateId: number; decision: 'approved' | 'skipped' | 'retried' }
  | { type: 'action:forceResolveGate'; gateId: number }
  | { type: 'action:resolveStageRequest'; requestId: number; response: string }
  | { type: 'subscribe:output'; runId: number }
  | { type: 'unsubscribe:output'; runId: number };

type WebSocketServerMessage =
  | { type: 'state:full'; payload: MsqWebState }
  | { type: keyof MsqEvents; payload: unknown };
```

## Areas tecnicas afetadas

- `src/web/` — novo modulo (servidor, API, event bridge, frontend estatico).
- `src/commands/web.ts` — comando `msq web`.
- `src/commands/daemon.ts` — comando `msq daemon start/stop/status/restart`.
- `src/cli.ts` — registro dos novos comandos.
- `src/config/index.ts` — extensao do schema com secao `web`.
- `package.json` — adicao da dependencia `ws`.
- `tsconfig.json` — possivel inclusao de `src/web/static/` se necessario.
- `README.md` e `docs/ROADMAP.md` — documentacao.
- `tests/web/` — testes de integracao do servidor WebSocket.

## Criterios de aceite

- [x] `msq web` inicia servidor em foreground na porta 8743 e serve a interface web.
- [x] `msq daemon start` inicia servidor detached e `msq daemon status` mostra running/PID.
- [x] `msq daemon stop` encerra o processo e remove o PID file.
- [x] `GET /api/state` retorna estado completo e requer token valido.
- [x] WebSocket em `/ws` autentica cliente e transmite eventos do `msqEventBus`.
- [x] Frontend renderiza kanban, gates, run detail e dashboard de custos.
- [x] Acoes do frontend (start, pause, resume, abort, resolve gate) refletem no estado real do `msq`.
- [x] Token e gerado automaticamente e armazenado no keyring (fallback para config JSON).
- [x] Toda a implementacao fica em `src/web/`; `src/ui/` nao e alterado.
- [x] Testes de integracao cobrem autenticacao, estado inicial e broadcast de eventos.
