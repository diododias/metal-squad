# H18 — Mapeamento de Tasks Incorreto (Duplicada, Fora de Ordem, Nao Carrega Apos speckit-tasks)

**Tipo**: Hotfix
**Status**: Pendente — triagem
**Prioridade sugerida**: Critica
**Relaciona**: F01 (YAML Schema v2), F35 (Backlog Catalog Import)

## Relato do usuario (2026-07-11)

> Nao esta reconhecendo corretamente as tasks, as vezes parece duplicado, as
> vezes nao aparece na ordem correta, e apos o speckit-tasks deveria carregar
> as tasks mas nao esta carregando

## Problema

Tres sintomas relacionados ao carregamento/exibicao de tasks:

1. Tasks aparentemente duplicadas.
2. Ordem incorreta na exibicao.
3. Apos o step `speckit-tasks` (gerador de tasks) rodar, as tasks geradas nao
   aparecem — sugere falha no parsing do output do step ou na escrita/leitura
   do catalogo (`backlog.yaml` vs banco, ver F35).

Este e o item mais critico do lote — afeta diretamente a confiabilidade do
pipeline (tasks sao a unidade de execucao).

## Escopo provavel

- `src/core/backlog/` — parsing/loader de tasks geradas por `speckit-tasks`
- `src/db/` — persistencia do catalogo de tasks (F35 trouxe o banco como
  fonte de verdade em runtime)
- Skill/prompt `speckit-tasks` — formato de saida esperado vs formato
  realmente parseado

## Proximo passo

Reproduzir com uma run real do step `speckit-tasks` (`MSQ_DB_PATH`,
`.claude/rules/harness.md`), capturando o output bruto do adapter e
comparando com o que o parser de tasks espera. Verificar se a duplicacao
acontece na escrita (mesma task inserida duas vezes) ou na leitura
(query/join duplicando linhas).
