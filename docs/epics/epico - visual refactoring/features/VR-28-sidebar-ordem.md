# Feature Specification: Ordem definida da sidebar

**Feature Branch**: `feat/vr28-sidebar-ordem`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M7 (Tema G)
**Depende de**: —

## Objetivo

Fixar a ordem do menu lateral conforme o `plan.md`:
`Project → Board → Run → Gates → Archived → Analytics → Settings`.

## Contexto de execução

- A ordem atual vive em `App.tsx:230-237` (`navItems`): `Board`, `Projects`,
  `Runs`, `Gates`, `Analytics`, `Archived`, `Settings`. O `Sidebar` apenas
  renderiza `items` na ordem recebida.
- Diferenças em relação ao alvo: `Projects` deve vir **antes** de `Board`, e
  `Archived` deve vir **antes** de `Analytics`.

O que **falta**: reordenar o array `navItems` (e o `MobileTabBar`, que consome o
mesmo `navItems`) para `Projects → Board → Runs → Gates → Archived → Analytics →
Settings`.

## Modelo técnico

- Reordenar `navItems` em `App.tsx`. O `label` "Project(s)"/"Run(s)" segue o
  vocabulário já usado (plural nas rotas de lista). Nenhuma mudança de rota, só
  ordem.
- `MobileTabBar` herda a ordem automaticamente (mesma prop `items`).

## Requirements

- A sidebar segue exatamente `Project → Board → Run → Gates → Archived →
  Analytics → Settings`.
- Desktop e mobile compartilham a ordem.
- Nenhuma rota quebrada; contadores (`count`) preservados.

## Arquivos afetados

- `src/web/client/App.tsx` (`navItems`).
- `tests/web/` — ordem dos itens de navegação.

## Success Criteria

- **SC-001**: a sidebar exibe os itens na ordem alvo.
- **SC-002**: o `MobileTabBar` segue a mesma ordem.
- **SC-003**: todas as rotas continuam navegáveis.
