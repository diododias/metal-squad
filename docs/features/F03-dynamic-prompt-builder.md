# F03 — Dynamic Prompt Builder

**Epic**: [E01 — Skills System](../epics/E01-skills-system.md)
**Prioridade**: Critica
**Esforco**: Medium
**Depende de**: F01, F02

## Problema

`buildSpecKitPrompt()` eh hardcoded — sempre gera o mesmo prompt spec-kit. Precisamos que o prompt seja montado dinamicamente baseado nas skills declaradas na feature/task.

## Solucao

### Novo fluxo

1. Ler feature do backlog (com `specFile`, `context`, `skills`)
2. Resolver skills via registry
3. Para cada skill, renderizar o prompt template com os dados da feature
4. Concatenar em ordem (skills sao executadas sequencialmente pelo agente)
5. Injetar conteudo de `specFile` e `context` como contexto adicional
6. Passar prompt final para o adapter

### Prompt template rendering

```typescript
function buildPrompt(feature: Feature, skills: Skill[], cwd: string): string {
  const specContent = feature.specFile 
    ? readFileSync(resolve(cwd, feature.specFile), 'utf8') 
    : null;
  
  const contextContent = (feature.context ?? [])
    .map(f => `--- ${f} ---\n${readFileSync(resolve(cwd, f), 'utf8')}`)
    .join('\n\n');

  const skillPrompts = skills.map(s => 
    renderTemplate(s.promptTemplate, {
      featureId: feature.id,
      featureTitle: feature.title,
      spec: specContent,
      context: contextContent,
    })
  );

  return skillPrompts.join('\n\n---\n\n');
}
```

### Controle de contexto

O prompt builder controla o tamanho do contexto:
- Skills com `inputs: ['specFile']` so recebem o spec
- Skills com `inputs: ['context']` recebem arquivos de contexto
- Limit de tamanho configuravel (evita explodir o context window)

## Criterios de aceite

- [ ] `buildSpecKitPrompt` substituido por `buildPrompt` dinamico
- [ ] Conteudo de `specFile` e arquivos de `context` injetados no prompt
- [ ] Skills renderizadas em ordem
- [ ] Adapters recebem prompt pronto (nao constroem mais)
- [ ] Fallback: se nenhuma skill declarada, usa `implement` (compatibilidade v1)
