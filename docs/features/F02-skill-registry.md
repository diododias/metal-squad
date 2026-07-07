# F02 — Skill Registry & Discovery

**Epic**: [E01 — Skills System](../epics/E01-skills-system.md)
**Prioridade**: Critica
**Esforco**: Medium
**Depende de**: F01

## Problema

Nao existe conceito de "skill" no msq. O prompt eh sempre o mesmo (spec-kit implement). Precisamos de um mecanismo para registrar, descobrir, e validar skills.

## Solucao

### O que eh uma skill?

Uma skill eh um bloco de instrucoes (prompt template) que o msq injeta na sessao do agente. Exemplos:
- `specify` — gera spec a partir de requisitos
- `plan` — cria plano de implementacao
- `implement` — executa o plano
- `review` — revisa codigo gerado
- `test` — gera e roda testes
- `decompose` — quebra features grandes em tasks atomicas

### Fontes de skills

1. **Built-in**: skills embutidas no msq (implement, review, test)
2. **Repo-level**: `.msq/skills/<name>/SKILL.md` no repo do usuario
3. **Global**: `~/.config/metal-squad/skills/<name>/SKILL.md`
4. **External**: skills de frameworks como spec-kit (detectadas se `.specify/` existe)

### Estrutura de uma skill

```
.msq/skills/decompose/
  SKILL.md          # prompt template com {{placeholders}}
  metadata.yaml     # nome, descricao, inputs requeridos, outputs esperados
```

### API interna

```typescript
interface Skill {
  name: string;
  source: 'builtin' | 'repo' | 'global' | 'external';
  promptTemplate: string;
  metadata: {
    description: string;
    inputs?: string[];   // e.g. ['specFile', 'context']
    outputs?: string[];  // e.g. ['tasks', 'plan']
  };
}

interface SkillRegistry {
  discover(cwd: string): Skill[];
  resolve(names: string[], cwd: string): Skill[];
  validate(names: string[]): { valid: boolean; missing: string[] };
}
```

## Criterios de aceite

- [ ] Registry descobre skills de todas as fontes (builtin, repo, global, external)
- [ ] `msq skills` lista skills disponiveis com fonte e descricao
- [ ] Validacao no `msq run`: avisa se uma skill referenciada no YAML nao existe
- [ ] Skills spec-kit sao detectadas automaticamente se `.specify/` ou `.agents/skills/speckit-*` existem
