# Feature Specification: Minimização da sidebar com ícones

**Feature Branch**: `feat/vr29-sidebar-minimizacao-icones`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M7 (Tema G)
**Depende de**: VR-28

## Objetivo

No modo colapsado, a sidebar deve mostrar **ícones** por item (com a 1ª letra
como fallback), em vez de só a primeira letra do rótulo.

## Contexto de execução

- A minimização **já existe**: `Sidebar.tsx` alterna largura (`collapsed ? 48 :
  var(--sidebar-width)`, `:46`) e, colapsada, renderiza
  `item.label.slice(0, 1)` (`:131`) — ou seja, hoje o fallback (1ª letra) já é o
  comportamento; falta o **ícone**.
- `SidebarNavItem` tem `label`, `path`, `count` (interface no topo do arquivo) —
  **não tem `icon`**. Adicionar um campo `icon` é a mudança central.

O que **falta**: adicionar `icon?` ao `SidebarNavItem`, definir um ícone por
rota em `App.tsx` (`navItems`), e no `Sidebar` renderizar o ícone quando
`collapsed` (fallback para `label.slice(0,1)` quando não houver ícone).

## Modelo técnico

- `Sidebar.tsx`: estender `SidebarNavItem` com `icon?: React.ReactNode` (ou
  string de glyph, no estilo dos glyphs já usados em `KanbanCard`/`StatusPill`).
  Colapsado → `item.icon ?? item.label.slice(0,1)`; expandido → label completo.
- `App.tsx`: atribuir um ícone a cada `navItem` (Board/Projects/Runs/Gates/
  Archived/Analytics/Settings), coerente com o set de glyphs do app.
- Manter `title`/`aria-label` com o rótulo completo para acessibilidade quando
  colapsado.

## Requirements

- Colapsada, a sidebar mostra ícones; sem ícone, cai na 1ª letra.
- Expandida, mostra ícone + rótulo (ou só rótulo, conforme design).
- Tooltip/`aria` preserva o rótulo completo no modo colapsado.

## Arquivos afetados

- `src/web/client/components/navigation/Sidebar.tsx`, `App.tsx` (ícones nos
  `navItems`).
- `tests/web/` — render de ícone colapsado; fallback 1ª letra.

## Success Criteria

- **SC-001**: a sidebar colapsada mostra ícones por item.
- **SC-002**: item sem ícone usa a 1ª letra do rótulo.
- **SC-003**: colapsada, cada item mantém o rótulo acessível via tooltip/aria.
