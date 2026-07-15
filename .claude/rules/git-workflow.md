# Git Workflow

## Regra base

Para toda feature, hotfix, refactor ou ajuste de docs/skills, crie ou reutilize uma
branch de trabalho no checkout atual e valide antes de commitar.

## Checkout e isolamento

- Trabalhe sempre no checkout atual deste repositorio.
- Crie a branch a partir de `develop` quando iniciar uma tarefa nova; nunca commite
  diretamente em `develop`.
- Nao crie worktrees, nao use `EnterWorktree` e nao mova a tarefa para outro
  checkout durante o fluxo do agente.
- Se ja existir uma branch de trabalho para a tarefa, reutilize-a.

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
- ao final da implementacao validada, faca push da branch de trabalho e abra um PR para `develop`
- use o template em `.claude/skills/dev-flow/pr-template.md`
- nao faca merge por conta propria

## Higiene

- verifique `git status` antes e depois das validacoes
- se a tarefa tocar docs de feature/hotfix, mantenha codigo e docs consistentes no mesmo branch
- se hooks ou comandos gerarem lixo local, trate isso no repo de forma permanente quando fizer sentido, em vez de limpar manualmente a cada run
