# H08 — `dev-flow` SKILL.md sem YAML frontmatter quebra `codex exec` no startup

**Tipo**: Hotfix
**Status**: Parcialmente resolvido (repo; global pendente de ação manual)
**Prioridade**: Alta
**Descoberto em**: 2026-07-06
**Comando observado**: `MSQ_DB_PATH=$(pwd)/.metal-squad/app.db node dist/index.js run --feature feat-07`

## Problema

O `codex exec` (0.142.5) tenta carregar todos os `SKILL.md` encontrados no diretório `.agents/skills/`
do projeto e do diretório global `~/.agents/skills/`. O arquivo `dev-flow/SKILL.md` não continha
YAML frontmatter (`--- name: "..." ---`), e o codex aborta com:

```
ERROR codex_core::session::session: failed to load skill .../dev-flow/SKILL.md:
  missing YAML frontmatter delimited by ---
```

Isso impede qualquer run via adapter `codex` no repositório.

## Evidências

- Erro no startup da session, antes de qualquer execução do agente
- Apenas `dev-flow/SKILL.md` não tinha frontmatter (todos os speckit SKILL.md já tinham)
- Codex 0.142.5 também alerta sobre `--full-auto` deprecated (`use --sandbox workspace-write`)

## Resolução parcial

- `.agents/skills/dev-flow/SKILL.md` no repo: frontmatter adicionado
- `~/.agents/skills/dev-flow/SKILL.md` global: requer ação manual do usuário

```bash
# Adicionar frontmatter ao arquivo global (rodar manualmente)
python3 - <<'EOF'
import os
path = os.path.expanduser("~/.agents/skills/dev-flow/SKILL.md")
with open(path) as f:
    content = f.read()
if not content.startswith("---"):
    with open(path, "w") as f:
        f.write('---\nname: "dev-flow"\ndescription: "Fluxo de desenvolvimento padrão: do worktree ao PR aberto."\n---\n\n' + content)
    print("Frontmatter adicionado.")
else:
    print("Já tem frontmatter.")
EOF
```

## Pendente

- Avaliar se o codex adapter deve ser atualizado para usar `--sandbox workspace-write` em vez de `--full-auto` (deprecated em 0.142.5)
- Ver [F25](../features/F25-msq-develop-harness-hardening.md) para hardening geral do harness
