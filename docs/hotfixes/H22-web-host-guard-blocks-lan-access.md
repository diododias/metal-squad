# H22 — Guard de Host/Origin do F51 bloqueava acesso ao `msq web` de outro PC na LAN

**Tipo**: Hotfix
**Status**: Concluido
**Prioridade**: Alta
**Descoberto em**: 2026-07-13
**Comando observado**: `msq web --host 0.0.0.0` (ou `::`) e acesso a partir de outro computador na mesma rede local via `http://<ip-da-lan>:8743`.

## Problema

Depois de F51 (web auth hardening, commit `5370c47`), subir o `msq web` com
`--host 0.0.0.0` para expor na LAN passou a rejeitar toda request de outro
PC:

- HTTP: `403 Forbidden host`
- WebSocket: fechado com `1008 Forbidden origin`

## Causa raiz

`isAllowedHostHeader` e `isAllowedOrigin` (`src/web/auth.ts`) aceitavam
apenas os hostnames em `LOCAL_HOSTNAMES` (`127.0.0.1`, `localhost`, `::1`)
ou uma correspondencia **literal** com `boundHost`.

Quando o operador sobe o servidor com `--host 0.0.0.0` (bind wildcard, para
aceitar conexao em qualquer interface), `boundHost` e a string `"0.0.0.0"`.
O browser de outro PC, porem, manda `Host: <ip-da-lan>:8743` — o IP real da
maquina que roda o `msq web`, nunca a string `"0.0.0.0"` em si (nenhum
cliente resolve ou envia o endereco wildcard como destino). Resultado: a
comparacao `normalized === normalizeHostname(boundHost)` nunca era
verdadeira e a request caia sempre no guard de DNS-rebinding, mesmo sendo
trafego legitimo que o operador explicitamente decidiu expor.

## Fix

`isAllowedHostHeader`/`isAllowedOrigin` agora tratam bind wildcard
(`0.0.0.0`, `::`) como um caso especial: alem de `LOCAL_HOSTNAMES` e do
`boundHost` literal, aceitam qualquer hostname que corresponda a um
endereco de interface de rede real desta maquina (via
`os.networkInterfaces()`, ignorando `internal`). Hosts arbitrarios (DNS
rebinding real) continuam rejeitados nesse modo. Quando o bind e um host
especifico (`127.0.0.1`, `localhost`, ou um IP explicito), o comportamento
de F51 nao muda — nenhuma superficie nova e aberta para quem nao pediu bind
wildcard.

## Arquivos

- `src/web/auth.ts` — `isAllowedHostHeader`, `isAllowedOrigin`,
  `isWildcardBindHost`, `localInterfaceHostnames`
- `tests/web/auth.test.ts` — cobertura de bind wildcard aceitando IP de LAN
  e continuando a rejeitar hosts estranhos

## Fora de escopo

- HTTPS/TLS local para acesso via LAN (permanece fora de escopo, como em F51)
- Deteccao de qual interface o cliente efetivamente usou (aceita-se
  qualquer interface nao-interna da maquina, nao so a que o cliente bateu)
