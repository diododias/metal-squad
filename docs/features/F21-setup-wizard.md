# F21 — Interactive Setup Wizard

**Epic**: [E05 — Developer Experience](../epics/E05-dx-improvements.md)
**Prioridade**: Media
**Esforco**: Medium

## Problema

`msq init` cria um backlog template minimo. Nao guia o usuario pela configuracao de tools, secrets, notifications, nem detecta automaticamente o que esta disponivel.

## Solucao

### Wizard interativo com Ink

```
Welcome to metal-squad! Let's set up your project.

Detected tools:
  ✓ claude (claude --version → 1.2.3)
  ✓ codex (codex --version → 0.5.1)
  ✗ opencode (not found)

Default tool? [claude]

Configure notifications?
  [ ] Telegram
  [ ] Slack webhook
  [ ] None

Concurrency (parallel features)? [3]

Create backlog.yaml with example? [Y/n]

Done! Run `msq run` to start.
```

### Auto-detection

- Verifica quais CLIs estao instalados (claude, codex, opencode, cursor, aider)
- Detecta frameworks (spec-kit via `.specify/`, etc)
- Detecta repo info (git remote, linguagem principal)

### Output

- `backlog.yaml` com defaults inteligentes
- `~/.config/metal-squad/config.json` atualizado
- Secrets salvos no keychain se necessario

## Criterios de aceite

- [ ] Wizard interativo via Ink
- [ ] Auto-detect de tools e frameworks
- [ ] Gera backlog.yaml e config.json
- [ ] Pede secrets quando necessario (telegram token, etc)
