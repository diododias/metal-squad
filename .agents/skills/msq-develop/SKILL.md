---
name: "msq-develop"
description: "Atua como QA do executor `msq`: seleciona a proxima feature, recompila o projeto imediatamente antes da execucao, roda `msq run` e valida se a ferramenta realmente implementou a feature sozinha. Nao implementa manualmente a feature alvo. Use quando for preciso testar o fluxo real do `msq`, validar evidencias, registrar bugs em `docs/hotfixes` e abrir PR apenas se o executor concluir com sucesso."
---

Esta copia em `.agents/skills/msq-develop/` existe apenas por compatibilidade com discovery legado.

## Fonte de verdade obrigatoria

Carregue e siga a skill canonica em:

- [`../../../.claude/skills/msq-develop/SKILL.md`](../../../.claude/skills/msq-develop/SKILL.md)

Use tambem:

- regras do repo: [`../../../.claude/rules/README.md`](../../../.claude/rules/README.md)

## Regra de manutencao

Nao mantenha logica propria aqui. Se esta copia divergir da `.claude`, a `.claude` vence.
