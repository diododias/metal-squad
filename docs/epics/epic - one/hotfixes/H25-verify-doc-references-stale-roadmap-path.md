# H25 — `verify-doc-references` apontava para caminho antigo de `docs/ROADMAP.md`

**Tipo**: Hotfix
**Status**: Concluído
**Prioridade**: Alta (bloqueava commit em qualquer branch via pre-commit)
**Descoberto em**: 2026-07-15

## Problema

O commit `0f03602` ("new features docs") moveu `docs/ROADMAP.md` para
`docs/epics/epic - one/ROADMAP.md` como parte da reorganização em épicos, mas
`scripts/verify-doc-references.mjs` continuou apontando para o caminho antigo
(`docs/ROADMAP.md`). Isso quebrava `npm run verify:doc-references` (chamado
por `verify:repo`, rodado no hook `pre-commit`) com `ENOENT`, bloqueando
qualquer commit em qualquer branch a partir de `develop`.

## Correção

Atualizado `scripts/verify-doc-references.mjs` para checar
`docs/epics/epic - one/ROADMAP.md` em vez de `docs/ROADMAP.md`.

## Evidência

```
$ node scripts/verify-doc-references.mjs
[verify-doc-references] stale references not found
```
