# CLAUDE.md — metal-squad (`msq`)

Instruções para o Claude Code neste repositório. Estas regras têm precedência sobre defaults do harness.

## Fluxo de implementação

- **Sempre use a skill `/dev-flow`** em qualquer implementação de código.
- Para validação do próprio executor/harness do `msq`, use `/msq-develop`.

## Worktree — PROIBIDO

- **NUNCA crie worktree neste projeto.** Não use a tool `EnterWorktree` sob nenhuma circunstância.
- Trabalhe sempre no checkout atual.

## Git

- **Pode commitar direto da branch `develop`.** Não é necessário criar branch isolada.
- Base branch padrão para PRs: `develop` (nunca `main`).
- Os desenvolvimentos são **sequenciais, não paralelos** — não há necessidade de isolamento entre tarefas.
- Prefira Conventional Commits simples: `feat(msq): ...`, `fix(skill): ...`, `docs(dev-flow): ...`.
- Commite somente depois da validação relevante (build/test/typecheck).
- Não faça merge por conta própria.

## Regras do repo

As regras detalhadas por área vivem em `.claude/rules/`:

- `repo-context.md` — produto, fontes de verdade e mapa do repositório
- `architecture.md` — ownership por pasta e limites entre camadas
- `git-workflow.md` — branch, commit, push e PR
- `testing.md` — baseline de build/test/typecheck/lint e suites focadas
- `harness.md` — `MSQ_DB_PATH`, anti-recursão e validação live do `msq`

## Baseline de validação (mudanças em `src/` ou `tests/`)

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
rtk npm run lint   # quando tocar TypeScript relevante em src/
```
