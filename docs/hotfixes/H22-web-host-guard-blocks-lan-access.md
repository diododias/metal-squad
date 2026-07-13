# H22 — Guard de Host/Origin do F51 bloqueava acesso ao `msq web` fora do localhost (LAN, mDNS, Tailscale MagicDNS)

**Tipo**: Hotfix
**Status**: Concluido
**Prioridade**: Alta
**Descoberto em**: 2026-07-13
**Comando observado**: `msq web --host 0.0.0.0` (ou `::`) e acesso a partir de outro dispositivo — PC na mesma rede local ou celular via Tailscale — usando IP de LAN, nome mDNS (`*.local`) ou hostname MagicDNS do Tailscale (`*.tailXXXX.ts.net`).

## Problema

Depois de F51 (web auth hardening, commit `5370c47`), subir o `msq web` com
`--host 0.0.0.0` para expor alem do loopback passou a rejeitar toda request
vinda de outro dispositivo:

- HTTP: `403 Forbidden host`
- WebSocket: fechado com `1008 Forbidden origin`

## Causa raiz

`isAllowedHostHeader` e `isAllowedOrigin` (`src/web/auth.ts`) aceitavam
apenas os hostnames em `LOCAL_HOSTNAMES` (`127.0.0.1`, `localhost`, `::1`)
ou uma correspondencia **literal** com `boundHost`.

Quando o operador sobe o servidor com `--host 0.0.0.0` (bind wildcard, para
aceitar conexao em qualquer interface), `boundHost` e a string `"0.0.0.0"`.
O cliente, porem, manda no header `Host` o endereco que ele efetivamente
usou para chegar ate a maquina — IP de LAN, nome mDNS ou o hostname
MagicDNS do Tailscale (`maquina.tailXXXX.ts.net`) — nunca a string
`"0.0.0.0"` em si (nenhum cliente resolve ou envia o endereco wildcard como
destino). Resultado: a comparacao `normalized === normalizeHostname(boundHost)`
nunca era verdadeira e a request caia sempre no guard de DNS-rebinding,
mesmo sendo trafego legitimo que o operador explicitamente decidiu expor.

Uma primeira correcao comparou o `Host`/`Origin` apenas contra os enderecos
IP das interfaces de rede reais da maquina (`os.networkInterfaces()`). Isso
resolve o caso de IP numerico de LAN, mas nao cobre nomes resolvidos via
DNS/mDNS — como o hostname MagicDNS do Tailscale — que nunca aparecem como
IP literal no header `Host`.

## Fix

Quando o bind e wildcard (`0.0.0.0`, `::`), `isAllowedHostHeader`/
`isAllowedOrigin` agora aceitam, alem de `LOCAL_HOSTNAMES` e do IP de
interface de rede real da maquina (como antes):

- hostnames terminados em `.local` (mDNS)
- hostnames terminados em `.ts.net` (Tailscale MagicDNS)

O guard de DNS-rebinding continua ativo nesse modo: um dominio arbitrario
(`evil.example`) nao bate com nenhum IP de interface nem com esses dois
sufixos, entao continua sendo rejeitado com `403`/`1008`. Quando o bind e
um host especifico (`127.0.0.1`, `localhost`, ou um IP explicito), o
comportamento original de F51 nao muda.

A alternativa de pular a validacao de hostname inteiramente em bind
wildcard foi descartada — mesmo com o argumento de que o login
ticket/cookie/token ja fazem o controle de acesso real, remover a camada de
Host/Origin por completo enfraquece a defesa em profundidade sem
necessidade, quando um allowlist de sufixos conhecidos resolve o caso real
sem abrir mao da checagem.

## Arquivos

- `src/web/auth.ts` — `isAllowedHostHeader`, `isAllowedOrigin`,
  `isWildcardBindHost`, `localInterfaceHostnames`, `ALLOWED_WILDCARD_SUFFIXES`
- `tests/web/auth.test.ts` — cobertura de bind wildcard aceitando IP de LAN,
  sufixo mDNS e sufixo MagicDNS do Tailscale, e continuando a rejeitar
  hosts estranhos

## Fora de escopo

- HTTPS/TLS local para acesso fora do loopback (permanece fora de escopo,
  como em F51)
- Outros provedores de VPN/DNS overlay com sufixo proprio — adicionar ao
  array `ALLOWED_WILDCARD_SUFFIXES` em `src/web/auth.ts` quando surgir caso
  real
