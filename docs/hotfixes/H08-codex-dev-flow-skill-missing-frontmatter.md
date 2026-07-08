# H08 — `dev-flow` SKILL.md sem YAML frontmatter quebra `codex exec` no startup

**Tipo**: Hotfix
**Status**: Resolvido
**Prioridade**: Alta
**Descoberto em**: 2026-07-06
**Resolvido em**: 2026-07-07
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

Codex 0.142.5 também alertava sobre `--full-auto` deprecated (`use --sandbox workspace-write`).

## Evidências

- Erro no startup da session, antes de qualquer execução do agente
- Apenas `dev-flow/SKILL.md` não tinha frontmatter (todos os speckit SKILL.md já tinham)

## Resolução

- `.agents/skills/dev-flow/SKILL.md` no repo: frontmatter adicionado
- `~/.agents/skills/dev-flow/SKILL.md` global: frontmatter adicionado via script
- `src/core/adapters/codex.ts`: `--full-auto` substituído por `--sandbox workspace-write`
