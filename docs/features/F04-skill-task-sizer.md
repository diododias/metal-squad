# F04 — Skill: Task Sizer (decomposicao atomica)

**Epic**: [E01 — Skills System](../epics/E01-skills-system.md)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: F02, F03

## Problema

Features grandes demais resultam em sessoes longas, caras, e propicias a erro. Nao existe mecanismo para medir a complexidade de uma feature e sugerir decomposicao em tasks menores e mais atomicas.

## Solucao

### Skill `decompose`

Uma skill built-in que analisa uma feature (via spec, contexto, codebase) e:
1. Estima complexidade (tokens estimados, arquivos afetados, pontos de risco)
2. Sugere decomposicao em tasks atomicas (cada uma < 30min de agente)
3. Gera as tasks no formato YAML pronto para o backlog
4. Identifica dependencias entre as tasks geradas

### Fluxo de uso

```bash
# Analisa uma feature e sugere decomposicao
msq decompose feat-01

# Aceita sugestao e atualiza o backlog
msq decompose feat-01 --apply
```

### Heuristicas de sizing

- Numero de arquivos que precisam ser tocados
- Complexidade do spec (tamanho, numero de requisitos)
- Dependencias externas (APIs, DB migrations, etc)
- Historico: features similares anteriores (tokens gastos, duracao)

### Output

```yaml
tasks:
  - id: task-01
    title: Atualizar schema zod com novos campos
    taskFile: .msq/generated/feat-01/task-01.md
    skills: [implement]
    estimate:
      tokens: ~15k
      duration: ~5min
      files: [src/core/backlog/schema.ts]
    dependsOn: []
  - id: task-02
    title: Adicionar validacao de specFile
    taskFile: .msq/generated/feat-01/task-02.md
    skills: [implement, test]
    estimate:
      tokens: ~20k
      duration: ~8min
      files: [src/core/backlog/load.ts, src/core/backlog/schema.ts]
    dependsOn: [task-01]
```

## Criterios de aceite

- [x] Skill `decompose` disponivel como built-in
- [x] `msq decompose <feature-id>` funciona standalone
- [x] Output YAML valido e importavel no backlog
- [x] Estimativas baseadas em heuristicas documentadas
- [x] `--apply` atualiza o backlog.yaml automaticamente
