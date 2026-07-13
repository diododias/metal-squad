# F51 — Web auth hardening (cookie session + login ticket + origin/host guard)

## Problema

O `msq web` autenticava o browser passando o token persistente na URL
(`?token=<hex>`) e guardando-o no JS do cliente:

- o token e de longa duracao (keychain/`config.json`) e nao rota — a URL que
  vaza em historico de browser/terminal, screenshot ou log vale para sempre;
- o token ficava acessivel ao JS da pagina (exfiltravel por XSS);
- o upgrade de WebSocket nao validava `Origin` — qualquer site aberto no
  browser podia tentar `new WebSocket('ws://127.0.0.1:8743/ws')`
  (cross-site WebSocket hijacking); com `--no-auth` isso era acesso total;
- o header `Host` nao era validado (DNS rebinding);
- a comparacao de token usava `===` (timing oracle).

## Solucao

### Login por ticket de uso unico + cookie de sessao

1. `msq web` imprime `http://host:port/auth?ticket=<hex>` — um *login ticket*
   aleatorio, de uso unico, com TTL de 10 minutos.
2. `GET /auth` valida o ticket (ou, como fallback documentado, o token
   persistente via `?token=`), cria uma sessao em memoria, seta cookie
   `msq_session` (`HttpOnly; SameSite=Strict; Path=/; Max-Age=7d`) e responde
   302 para `/` — a credencial some da URL imediatamente.
3. O upgrade do WebSocket e autenticado pelo cookie: o JS do cliente nunca
   toca em token nem session id. O `window.prompt` e o `?token=` do cliente
   foram removidos.
4. Sessoes vivem em memoria: reiniciar o servidor invalida todas (o proximo
   `msq web` imprime um ticket novo).

A autenticacao legada por mensagem WS `{type:'auth', token}` continua aceita
para clientes programaticos e testes.

### Guards de request

- **Host**: toda request HTTP/WS com `Host` fora de
  `{127.0.0.1, localhost, ::1, host configurado}` recebe 403 (DNS rebinding).
- **Origin**: upgrade de WS com header `Origin` de outra origem e fechado com
  1008 (CSWSH). `Origin` ausente (clientes nao-browser) continua aceito, pois
  a autenticacao ainda e exigida.
- **timingSafeEqual**: comparacoes de token/ticket/sessao usam
  `crypto.timingSafeEqual` com hash de comprimento fixo.

### Rotacao de token

`msq web --rotate-token` gera e persiste um token novo (keychain com fallback
para `config.json`) antes de subir o servidor, invalidando o anterior.

## Arquivos

- `src/web/auth.ts` — tickets, sessoes, cookies, validadores de host/origin
- `src/web/server.ts` — endpoint `/auth`, guards, auth por cookie no WS
- `src/web/token.ts` — `rotateWebToken()`
- `src/commands/web.ts` — URL de login por ticket, `--rotate-token`
- `src/web/client/App.tsx`, `src/web/client/hooks/useWebSocket.ts` — remocao
  do token no cliente; erro de auth exibido na tela de conexao
- `tests/web/auth.test.ts`, `tests/web/server.test.ts` — cobertura

## Fora de escopo

- HTTPS/TLS local (o bind default segue `127.0.0.1`)
- Persistencia de sessao entre restarts do servidor
- Multi-usuario/roles

## Hotfixes relacionados

- [`H22`](../hotfixes/H22-web-host-guard-blocks-lan-access.md) — os guards de
  Host/Origin acima bloqueavam acesso legitimo quando o operador sobe o
  servidor com `--host 0.0.0.0`/`::` para expor alem do loopback (LAN, mDNS,
  Tailscale MagicDNS); corrigido estendendo o allowlist, em bind wildcard,
  para IPs de interface real da maquina e os sufixos `.local`/`.ts.net`,
  mantendo o guard de DNS-rebinding ativo para dominios arbitrarios.
