# F46 — Prompt/Skill Customizado por Step

**Tipo**: Feature
**Status**: Pendente — triagem
**Prioridade sugerida**: Media
**Relaciona**: F02 (Skill Registry), F03 (Dynamic Prompt Builder)

## Relato do usuario (2026-07-11)

> permitir inserir uma skill ou prompt que vai guiar aquela step

## Problema

Hoje as skills parecem resolvidas por precedence global (repo > global >
external > builtin, `.claude/rules/architecture.md`), sem um mecanismo claro
de "esta skill/prompt extra guia especificamente este step desta feature".

## Escopo provavel

- `src/core/skills/` — discovery/resolve (nao deve duplicar regra de
  precedence em outro modulo, conforme antipadrao documentado)
- `src/core/backlog/` — schema para associar skill/prompt extra a um step
  especifico
- `src/core/backlog/` (prompt builder, F03) — injecao do prompt customizado
  na montagem final

## Proximo passo

Ler `docs/features/F02-skill-registry.md` e `F03-dynamic-prompt-builder.md`
para confirmar se "prompt customizado por step" e melhor modelado como uma
skill de precedence mais alta (reaproveitando F02) ou como um campo novo no
schema do backlog — evitar path paralelo de resolucao de prompt.
