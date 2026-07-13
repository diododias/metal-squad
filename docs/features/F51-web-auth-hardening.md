# F51 — Web auth hardening (cookie session + password login + origin/host guard)

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

Uma primeira iteracao trocou o token persistente na URL por um *login
ticket* de uso unico (`?ticket=<hex>`, TTL de 10 minutos): o ticket nao vale
para sempre, mas ainda era uma credencial na URL — visivel em historico de
browser, screenshot ou log de terminal durante a janela em que era valido.

## Solucao

### Login por senha (form POST) + cookie de sessao

1. `msq web` imprime apenas `http://host:port` — nenhuma credencial na URL.
2. `GET /auth` serve um formulario HTML simples com um campo de senha. O
   `POST /auth` recebe a senha no corpo da requisicao (`application/
   x-www-form-urlencoded`), nunca em querystring.
3. A senha e resolvida em `resolveWebPassword()` (`src/web/token.ts`), nesta
   ordem:
   - `MSQ_WEB_PASSWORD` (env var) — definida manualmente pelo operador, nunca
     persistida pelo `msq`; tem prioridade e permite trocar a senha so
     mudando o valor no ambiente/sessao;
   - fallback: o token auto-gerado e persistido (keychain, com fallback para
     `~/.config/metal-squad/config.json`) — mesmo mecanismo de antes, para
     quem ainda nao definiu uma senha explicita.
4. Senha correta: cria sessao em memoria, seta cookie `msq_session`
   (`HttpOnly; SameSite=Strict; Path=/; Max-Age=7d`) e responde 302 para `/`.
   Senha incorreta: 401 com o mesmo formulario e uma mensagem de erro (sem
   redirect, sem nada sensivel na URL).
5. `GET /auth` com uma sessao ja valida (cookie) redireciona direto para `/`,
   sem reexibir o formulario.
6. O upgrade do WebSocket e autenticado pelo cookie: o JS do cliente nunca
   toca em senha, token nem session id.
7. Sessoes vivem em memoria: reiniciar o servidor invalida todas.

A autenticacao legada por mensagem WS `{type:'auth', token}` e por header
`Authorization: Bearer <token>` continua aceita para clientes programaticos e
testes — comparando contra o mesmo segredo resolvido por
`resolveWebPassword()`.

### Guards de request

- **Host**: toda request HTTP/WS com `Host` fora de
  `{127.0.0.1, localhost, ::1, host configurado}` recebe 403 (DNS rebinding).
- **Origin**: upgrade de WS com header `Origin` de outra origem e fechado com
  1008 (CSWSH). `Origin` ausente (clientes nao-browser) continua aceito, pois
  a autenticacao ainda e exigida.
- **timingSafeEqual**: comparacoes de senha/token/sessao usam
  `crypto.timingSafeEqual` com hash de comprimento fixo.
- o corpo de `POST /auth` e lido com um limite de 8KB (`MAX_AUTH_BODY_BYTES`)
  para nao bufferizar payload arbitrario de um cliente nao autenticado.

### Rotacao

`msq web --rotate-token` gera e persiste uma senha nova (keychain com
fallback para `config.json`) antes de subir o servidor, invalidando a
anterior. E ignorado (com aviso no console) quando `MSQ_WEB_PASSWORD` esta
definida — nesse caso a rotacao e trocar a env var.

## Sem rate limiting (decisao deliberada)

Nao ha lockout/delay progressivo em `POST /auth`. O bind default e
`127.0.0.1` e a superficie de ataque de forca bruta local e considerada
aceitavel para este caso de uso; reavaliar se `msq web` passar a expor por
padrao para alem do loopback.

## Arquivos

- `src/web/auth.ts` — sessoes, cookies, validadores de host/origin
- `src/web/server.ts` — endpoint `/auth` (GET formulario, POST login),
  leitura de body com limite, guards, auth por cookie no WS
- `src/web/token.ts` — `resolveWebPassword()`, `getOrCreateWebToken()`,
  `rotateWebToken()`
- `src/commands/web.ts` — URL sem credencial, `--rotate-token`
- `src/web/client/App.tsx`, `src/web/client/hooks/useWebSocket.ts` — cliente
  nunca toca em senha/token; erro de auth exibido na tela de conexao
- `tests/web/auth.test.ts`, `tests/web/server.test.ts` — cobertura

## Fora de escopo

- HTTPS/TLS local (o bind default segue `127.0.0.1`)
- Persistencia de sessao entre restarts do servidor
- Multi-usuario/roles
- Rate limiting / lockout em `POST /auth` (ver secao acima)

## Hotfixes relacionados

- [`H22`](../hotfixes/H22-web-host-guard-blocks-lan-access.md) — os guards de
  Host/Origin acima bloqueavam acesso legitimo quando o operador sobe o
  servidor com `--host 0.0.0.0`/`::` para expor alem do loopback (LAN, mDNS,
  Tailscale MagicDNS); corrigido estendendo o allowlist, em bind wildcard,
  para IPs de interface real da maquina e os sufixos `.local`/`.ts.net`,
  mantendo o guard de DNS-rebinding ativo para dominios arbitrarios.
