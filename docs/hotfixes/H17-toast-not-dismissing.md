# H17 — Toast Nao Some Depois de Aparecer

**Tipo**: Hotfix
**Status**: Pendente — triagem
**Prioridade sugerida**: Baixa

## Relato do usuario (2026-07-11)

> toast nao some depois que aparece

## Problema

Notificacoes toast na UI (provavelmente dashboard web) ficam presas na tela
em vez de desaparecer apos o tempo esperado.

## Escopo provavel

- `src/web/static/components/` — componente de toast, timer de dismiss

## Proximo passo

Item pequeno e isolado — localizar o componente de toast e o timer de
auto-dismiss; provavel regressao simples (timer nao disparando, ou
re-render resetando o timer a cada novo estado).
