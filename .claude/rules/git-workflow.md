# Git Workflow

## Regra base

Para feature, hotfix e refactor com risco real, prefira worktree isolada antes de editar.

## Quando usar worktree

Use worktree por padrao quando:

- a tarefa toca `src/` ou `tests/`
- a entrega pode virar commit/PR
- ha chance de o usuario querer continuar outras tarefas no checkout principal

Pode trabalhar no checkout atual quando:

- o usuario ja preparou este checkout especificamente para a tarefa
- a mudanca e pequena e localizada em docs/skills/regras

## Naming sugerido

- `feat/f05-layout-multi-panel`
- `fix/h03-readonly-db`
- `docs/dev-flow-rules`
- `chore/skill-alignment`

Se existir `Fxx` ou `Hxx`, inclua esse id no branch, no commit ou no PR.

## Commits

- commite somente depois da validacao relevante
- prefira Conventional Commits simples: `feat(msq): ...`, `fix(skill): ...`, `docs(dev-flow): ...`
- nao misture refactor incidental grande com a correcao principal sem necessidade

## Push e PR

- base branch padrao: `develop`
- abra PR quando o usuario pedir publicacao ou quando a tarefa estiver claramente no fluxo "ate PR"
- use o template em `.claude/skills/dev-flow/pr-template.md`
- nao faca merge por conta propria

## Higiene

- verifique `git status` antes e depois das validacoes
- se a tarefa tocar docs de feature/hotfix, mantenha codigo e docs consistentes no mesmo branch
- se hooks ou comandos gerarem lixo local, trate isso no repo de forma permanente quando fizer sentido, em vez de limpar manualmente a cada run
