# H15 — Contagem de Tokens Confusa e Aparentemente Errada (Session vs Pipeline, Queda 69K→20K)

**Tipo**: Hotfix
**Status**: Pendente — triagem
**Prioridade sugerida**: Alta
**Relaciona**: F30 (Token & Context Telemetry Refinement)

## Relato do usuario (2026-07-11)

> session tokens e pipeline tokens ta confuso, eu nao sei qual deles e o
> TOTAL TOKENS, deixe mais explicito, na tela principal a contagem parece
> errada, ali deve ser total consumido geral
> desativar funcionalidade max tokens
> Durante execucao marca 69K tokens, ao terminar ficou aparecendo 20K, tem
> alguma contagem estranha nos tokens consumidos e parece que o total soma
> em cima dos 20k errados

## Problema

Dois problemas distintos, possivelmente relacionados:

1. **UX**: dois numeros (`session tokens`, `pipeline tokens`) sem indicacao
   clara de qual e o "TOTAL TOKENS" consumido — usuario espera ver, na tela
   principal, o total geral consumido.
2. **Bug de calculo**: durante a execucao o contador mostra ~69K, mas ao
   terminar cai para ~20K — sugere que o valor "final" esta sendo recalculado
   a partir de uma fonte diferente (ex.: soma de token_usage por run em vez
   de acumulado por sessao), e que somas subsequentes partem desse valor
   errado (20K) em vez do real.

## Escopo provavel

- `src/db/` — queries de agregacao de `token_usage` (por sessao, por
  pipeline, por feature)
- `src/core/events/` ou runner — ponto onde o total "ao vivo" (69K) e
  calculado vs. o total "final" persistido (20K) — provavel fonte dupla de
  verdade
- `src/ui/` / `src/web/static/components/` — label/exibicao do total

## Proximo passo

Antes de mexer na UI, reproduzir o bug de queda 69K→20K com uma run real e
`MSQ_DB_PATH` de harness (`.claude/rules/harness.md`), inspecionando as
linhas de `token_usage` no SQLite diretamente para achar onde a soma diverge
da contagem ao vivo. So depois desenhar qual numero vira "TOTAL TOKENS" na
tela principal. O pedido de "desativar max tokens" e uma config separada,
provavelmente um toggle simples em F14 (budget caps).
