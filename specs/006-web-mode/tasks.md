# F32 — Web Mode: Tasks

## Fase 1 — Setup e configuracao

1. [ ] Adicionar `ws` como dependencia direta em `package.json`.
2. [ ] Atualizar `package-lock.json` com `npm install`.
3. [ ] Estender `ConfigSchema` em `src/config/index.ts` com secao `web` (`host`, `port`, `auth`).
4. [ ] Criar `src/web/auth/token.ts` para gerar, ler e validar token web (keyring + fallback config).
5. [ ] Criar `src/web/types.ts` com tipos compartilhados (`MsqWebState`, `WebSocketClientMessage`, `WebSocketServerMessage`).

## Fase 2 — Servidor HTTP e WebSocket

6. [ ] Criar `src/web/server.ts` que inicia servidor HTTP + WebSocket na porta/configurada.
7. [ ] Criar `src/web/router.ts` com rotas `GET /`, `GET /static/*`, `GET /api/health`, `GET /api/state`.
8. [ ] Implementar middleware de autenticacao para HTTP e WS em `src/web/auth/middleware.ts`.
9. [ ] Implementar handshake de autenticacao via WS (primeira mensagem `{ type: 'auth', token }`).
10. [ ] Criar `src/web/static/` com `index.html`, `styles.css` e estrutura de pastas para assets.

## Fase 3 — Estado e eventos

11. [ ] Criar `src/web/api/state.ts` com funcao `buildMsqWebState()` reaproveitando funcoes de `src/db/repo.ts` e `src/ui/catalog.ts`.
12. [ ] Criar `src/web/events/bridge.ts` para inscrever `msqEventBus` e retransmitir eventos para clientes WS.
13. [ ] Implementar controle de subscricao de output por run (`subscribe:output`/`unsubscribe:output`).
14. [ ] Garantir que novos clientes WS recebam `state:full` ao autenticar.

## Fase 4 — Acoes de controle

15. [ ] Criar `src/web/api/actions.ts` com handlers para cada acao WS:
    - `startFeature` (spawn `msq run --feature <id>` detached)
    - `pausePipeline`, `resumePipeline`, `abortPipeline`
    - `requestFeatureAbort`
    - `resolveGate`, `forceResolveGate`
    - `resolveStageRequest`
16. [ ] Validar permissoes/estado antes de executar cada acao (ex: so pausar pipeline running).
17. [ ] Retornar confirmacao ou erro via WS apos cada acao.

## Fase 5 — Comandos CLI

18. [ ] Criar `src/commands/web.ts` registrando `msq web` com options `--host`, `--port`, `--no-auth`.
19. [ ] Criar `src/commands/daemon.ts` registrando `msq daemon start|stop|status|restart`.
20. [ ] Implementar `src/web/daemon/lifecycle.ts` para PID file (`~/.local/share/metal-squad/daemon.pid`) e start/stop/status.
21. [ ] Registrar `registerWeb` e `registerDaemon` em `src/cli.ts`.

## Fase 6 — Frontend web

22. [ ] Criar `src/web/static/index.html` importando React, ReactDOM e `app.js` via CDN ESM.
23. [ ] Criar `src/web/static/app.js` como entry point do React (sem JSX).
24. [ ] Criar `src/web/static/hooks/useWebSocket.js` para gerenciar conexao, auth e reconexao.
25. [ ] Criar `src/web/static/hooks/useMsqState.js` para manter e atualizar o estado global.
26. [ ] Criar componentes em `src/web/static/components/`:
    - `HeaderBar.js`
    - `KanbanBoard.js` + `KanbanCard.js`
    - `RunDetail.js`
    - `GatePanel.js`
    - `CostDashboard.js`
    - `CommandPalette.js`
    - `ToastStack.js`
    - `StatusBar.js`
    - `HelpOverlay.js`
27. [ ] Implementar atalhos de teclado equivalentes aos da TUI em `src/web/static/hooks/useKeyboardShortcuts.js`.
28. [ ] Implementar command palette com fuzzy match em `src/web/static/lib/fuzzyMatch.js`.

## Fase 7 — Build e empacotamento

29. [ ] Configurar build para copiar `src/web/static/` para `dist/web/static/` (ex: script no `package.json` ou ajuste no `tsc` + `cp`).
30. [ ] Garantir que `dist/index.js` consiga resolver o caminho dos assets estaticos em runtime.
31. [ ] Adicionar `src/web/static/` a arquivos incluidos no pacote npm (`package.json` `files` ou garantir copia para `dist`).

## Fase 8 — Testes

32. [ ] Criar `tests/web/server.test.ts` com testes de integracao:
    - servidor sobe em porta aleatoria
    - `GET /api/state` requer autenticacao
    - WebSocket autentica e recebe `state:full`
    - evento do `msqEventBus` e broadcastado para clientes WS
    - acao via WS executa handler correspondente
33. [ ] Criar `tests/web/daemon.test.ts` para start/stop/status com PID file em diretorio temporario.
34. [ ] Adicionar testes unitarios para `src/web/auth/token.ts` com keyring mockado.
35. [ ] Executar `npm run test` e garantir que nao haja regressoes.

## Fase 9 — Documentacao

36. [ ] Atualizar `README.md` com comandos `msq web` e `msq daemon`.
37. [ ] Atualizar `docs/ROADMAP.md` incluindo E06/F32 no progresso.
38. [ ] Marcar criterios de aceite em `docs/features/F32-web-mode.md` conforme implementacao.
