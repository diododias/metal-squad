# E01 — Skills System & YAML Parametrization

## Motivacao

Hoje o `msq` esta hardcoded ao workflow spec-kit (`buildSpecKitPrompt` gera sempre o mesmo prompt referenciando `/speckit.implement`). Isso amarra o projeto a um unico framework de desenvolvimento e impede o uso de skills customizadas, combinacoes de ferramentas, e controle granular de contexto por sessao.

## Objetivo

Substituir o acoplamento ao spec-kit por um sistema de skills declarativo no YAML, onde cada feature/task declara quais skills usar, e o orquestrador monta o prompt e o contexto da sessao de acordo.

## Mudancas Arquiteturais

1. **Schema YAML v2**: campo `skills: [skill1, skill2]` em features e tasks
2. **Arquivos associados**: campos `specFile` e `taskFile` para referenciar arquivos externos (markdown, yaml) que descrevem a feature/task em detalhe
3. **Skill registry**: descoberta e validacao de skills disponiveis (do repo, globais, ou de plugins)
4. **Prompt builder dinamico**: monta o prompt baseado nas skills declaradas, nao mais hardcoded
5. **Remocao do acoplamento spec-kit**: spec-kit vira apenas mais uma skill disponivel, nao o default obrigatorio

## Features

- [F01 — YAML Schema v2 (skills + arquivos associados)](../features/F01-yaml-schema-v2.md)
- [F02 — Skill Registry & Discovery](../features/F02-skill-registry.md)
- [F03 — Dynamic Prompt Builder](../features/F03-dynamic-prompt-builder.md)
- [F04 — Skill: Task Sizer (decomposicao atomica)](../features/F04-skill-task-sizer.md)

## Impacto

- `src/core/backlog/schema.ts` — schema zod precisa aceitar skills + specFile/taskFile
- `src/core/backlog/prompt.ts` — reescrever para ser dinamico
- `backlog.yaml` / `backlog.example.yaml` — atualizar formato
- `src/core/adapters/*.ts` — runFeature precisa receber o prompt construido, nao construir
- Novo modulo: `src/core/skills/`
