# E06 — Web Version

## Motivacao

O `msq` hoje so pode ser controlado localmente via terminal: comandos CLI ou a TUI (`msq ui`). Quando o usuario quer acompanhar runs, resolver gates ou pausar pipelines de outro computador, celular ou de um ambiente sem terminal interativo, nao ha alternativa. Uma versao web resolve esse problema, transformando o `msq` em um painel de controle acessivel pelo navegador.

## Objetivo

Criar um modo web independente da TUI que permita monitorar e controlar o `msq` remotamente. A primeira versao deve ser um clone funcional da interface da TUI (dashboard kanban, gates, detalhe de run, command palette, dashboard de custos), mas rodando no browser.

## Features

- [F32 — Web Mode](../features/F32-web-mode.md)

## Impacto

- `src/web/` — novo modulo isolado com servidor HTTP/WebSocket e frontend.
- `src/cli.ts` — novos comandos `msq web` e `msq daemon start/stop/status/restart`.
- `src/config/index.ts` — nova secao `web` no schema de configuracao.
- `src/db/repo.ts` e `src/core/events/` — reaproveitados sem alteracoes de logica.
- `package.json` — nova dependencia `ws` para WebSocket.
- `README.md` e `docs/ROADMAP.md` — documentacao dos novos comandos.
