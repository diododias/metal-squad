# F01 — YAML Schema v2 (skills + arquivos associados)

**Epic**: [E01 — Skills System](../epics/E01-skills-system.md)
**Prioridade**: Critica (fundacao de E01)
**Esforco**: Medium

## Problema

O schema atual (`backlog.yaml`) nao tem campo para skills customizadas e nao permite associar arquivos externos a features/tasks. O campo `spec` eh um texto inline opcional, insuficiente para features complexas.

## Solucao

### Novo schema YAML v2

```yaml
version: 2
repo: metal-squad
defaults:
  tool: claude
  effort: medium
  skills: [implement]

epics:
  - id: epic-1
    title: Skills System
    features:
      - id: feat-01
        title: YAML Schema v2
        tool: claude
        effort: medium
        skills: [specify, plan, implement]
        specFile: docs/features/F01-yaml-schema-v2.md  # arquivo com spec detalhada
        context:                                        # arquivos extras de contexto
          - src/core/backlog/schema.ts
          - docs/epics/E01-skills-system.md
        dependsOn: []
        tasks:
          - id: task-01
            title: Atualizar BacklogSchema zod
            taskFile: specs/001/tasks/task-01.md        # arquivo com descricao da task
            skills: [implement]
            dependsOn: []
          - id: task-02
            title: Migration v1 -> v2
            taskFile: specs/001/tasks/task-02.md
            skills: [implement]
            dependsOn: [task-01]
```

### Mudancas no schema zod

- `FeatureSchema`: adicionar `skills`, `specFile`, `context`
- `TaskSchema`: adicionar `taskFile`, `skills`
- `BacklogSchema`: adicionar `defaults`, bumpar version para `z.literal(2)`, manter compatibilidade com v1
- Validacao: `specFile`/`taskFile` devem existir no disco quando referenciados

### Migracoes

- `version: 1` continua funcionando (defaults sao aplicados, `skills` default = `[implement]`)
- CLI warning quando `version: 1` eh detectado sugerindo upgrade

## Criterios de aceite

- [ ] Schema zod aceita v1 e v2
- [ ] `specFile` e `taskFile` sao resolvidos relativos ao root do repo
- [ ] Defaults sao propagados para features/tasks que nao declaram skills
- [ ] Testes unitarios para parsing v1 e v2
- [ ] `backlog.example.yaml` atualizado com formato v2
