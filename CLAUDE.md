# CLAUDE.md — metal-squad (`msq`)

Instruções para o Claude Code neste repositório. Estas regras têm precedência sobre defaults do harness.

## Fluxo de implementação

- **Sempre use a skill `/dev-flow`** em qualquer implementação de código.
- Para validação do próprio executor/harness do `msq`, use `/msq-develop`.

## Worktree — PROIBIDO

- **NUNCA crie worktree neste projeto.** Não use a tool `EnterWorktree` sob nenhuma circunstância.
- Trabalhe sempre no checkout atual.

## Git

- **Sempre crie ou reutilize uma branch de trabalho antes de implementar.** Nunca commite diretamente em `develop`.
- Base branch padrão para PRs: `develop` (nunca `main`).
- Ao concluir a implementação e a validação, faça commit, push e abra um PR para `develop`.
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

## Exploracao de contexto

- Para exploracao estrutural e impacto de mudanca, consulte **Dora antes de leitura bruta**.
- Para simbolos, edicoes precisas e memoria operacional, consulte **Serena antes de leitura bruta**.
- Leitura direta de arquivo via shell deve entrar depois que Dora/Serena nao cobrirem a necessidade.
- Quando a memoria `mem:core` do Serena existir no ambiente, carregue-a primeiro.
- Enquanto ela nao existir, use o fallback versionado em `.claude/serena/mem-core.md`.
- O objetivo operacional e reduzir exploracoes estruturais por shell e deixar rastreio em runtime quando Dora/Serena forem usados.

## Baseline de validação (mudanças em `src/` ou `tests/`)

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
rtk npm run lint   # quando tocar TypeScript relevante em src/
npm run clean:db
```

## Comandos MSQ
```bash
msq backlog load
msq web
msq ui
```
