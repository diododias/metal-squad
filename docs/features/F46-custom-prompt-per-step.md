# F46 — Prompt/Skill Customizado por Step

**Tipo**: Feature
**Status**: Implementado
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

## Contrato entregue

`workflow.stepGuidance` agora aceita chaves por stage, reaproveitando o mesmo
registro de skills do backlog:

```yaml
workflow:
  mode: staged
  stages: [specify, plan, tasks, implement, validate]
  stepGuidance:
    implement:
      skills:
        - repo-implement-guardrails
      prompt: |
        Touch only the files needed for this stage.
```

## Garantias

- skills nomeadas em `workflow.stepGuidance.<stage>.skills` usam a precedence
  canonica `repo > global > external > builtin`
- stage sem `stepGuidance` mantem o prompt byte-equivalent ao comportamento
  anterior
- prompt final concatena, nesta ordem: base skills, step-guidance skills
  deduplicadas e prompt direto do stage
- prompt direto vazio ou so com whitespace e ignorado
- validacao do backlog falha antes da execucao se uma skill nomeada nao existir
