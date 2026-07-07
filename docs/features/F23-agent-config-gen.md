# F23 — CLAUDE.md / Agent Config Generation

**Epic**: [E05 — Developer Experience](../epics/E05-dx-improvements.md)
**Prioridade**: Baixa
**Esforco**: Low

## Problema

Cada tool (claude, codex, opencode) tem seu proprio formato de configuracao de contexto (CLAUDE.md, .codex/*, etc). Configurar cada um manualmente eh repetitivo.

## Solucao

### Geracao automatica

Baseado no backlog e nas skills, gerar arquivos de config adequados para cada tool:

```bash
msq config gen          # gera para todos os tools em uso
msq config gen claude   # gera CLAUDE.md
msq config gen codex    # gera .codex/config.yaml
```

### O que gera

- **CLAUDE.md**: instrucoes do projeto, referencia a skills, comandos uteis
- **codex config**: modelo, instructions, etc
- **opencode config**: provider, model, etc

### Conteudo dinamico

Inclui no config gerado:
- Skills disponiveis no repo
- Convencoes do projeto (linguagem, framework, test runner)
- Referencia ao backlog (features ativas)

## Criterios de aceite

- [ ] Gera CLAUDE.md funcional para o repo
- [ ] Gera configs para codex e opencode
- [ ] Conteudo baseado no estado real do repo
- [ ] Nao sobrescreve configs existentes sem `--force`
