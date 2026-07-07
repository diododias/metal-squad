# F26 — Resume de pipeline a partir do estado persistido

**Epic**: [E03 — Orchestration v2](../epics/E03-orchestration-v2.md)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: F12

## Problema

Hoje o `msq` nao tem um resume real. Quando uma execucao longa eh interrompida ou falha no meio:

- o operador precisa rerodar `msq run`
- o sistema nao distingue claramente o que ja foi concluido do que precisa continuar
- a retomada depende de estado parcial no worktree e de interpretacao manual do banco
- features ja concluidas podem ser executadas de novo sem necessidade

No teste de 2026-07-06, a retomada pratica so foi possivel via nova execucao do `run --feature feat-03`, que reaproveitou o worktree alterado, concluiu `feat-02` e avancou para `feat-03`, mas isso nao equivale a um resume formal do pipeline.

## Objetivo

Permitir retomar uma pipeline pausada, interrompida ou parcialmente executada a partir do estado persistido no banco, sem depender de rerun cego nem de inspecao manual do operador.

## Solucao

### Novo comando

```bash
msq resume <run-id|feature-id|repo-id>
```

O comando deve:

- localizar a execucao ou pipeline interrompida
- reconstruir o plano restante com base no backlog atual e no estado persistido
- pular features ja concluidas com sucesso
- reexecutar features que ficaram `running`, `failed` ou `blocked`, conforme politica configurada

### Estado minimo necessario

Persistir contexto suficiente para retomar com seguranca:

- repo / cwd original
- backlog ou snapshot do plano resolvido
- features concluidas
- feature ativa no momento da interrupcao
- metadados do tool adapter usados na run

### Politica de retomada

- `done` -> nao reexecuta
- `running` interrompido -> reexecuta a feature
- `failed` -> opcionalmente reexecuta conforme flag `--include-failed`
- `blocked` -> exige resolucao explicita antes do resume

### Observabilidade

- `msq status` deve deixar claro quando uma run eh retomavel
- `msq resume` deve imprimir:
  - o que sera reaproveitado
  - o que sera reexecutado
  - o ponto exato de retomada

## Escopo tecnico

- Expandir o modelo de `runs` para representar grupos de execucao / sessao de pipeline.
- Persistir snapshot do plano resolvido ou referencia consistente ao backlog usado.
- Introduzir um resolvedor de retomada que calcule o subconjunto restante da DAG.
- Adicionar comando CLI `resume`.
- Ajustar TUI e `status` para expor estado retomavel.
- Integrar com `pause/resume/abort` e com limpeza de runs orfas sem perder recuperabilidade.

## Criterios de aceite

- [ ] `msq resume` retoma uma pipeline parcialmente executada sem reexecutar features `done`.
- [ ] Features interrompidas no meio podem ser reexecutadas a partir do ponto salvo da pipeline.
- [ ] `msq status` identifica claramente runs retomaveis.
- [ ] O operador consegue retomar sem depender de analise manual do SQLite.
- [ ] Existe teste cobrindo interrupcao apos uma feature concluida e retomada da proxima feature pendente.
