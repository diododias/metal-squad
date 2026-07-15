# Feature Specification: Renomear "Config" → "Settings"

**Feature Branch**: `feat/set10b-renomear-config-settings`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M2 (Board por workflow de feature + limpeza do Config)
**Origem no plano**: S10b (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Renomear a página, o item de navegação e o título de 'Config' para 'Settings' (arquivo,
> componente e labels). Manter as sub-tabs."

Alinha a nomenclatura ao modelo-alvo: a página de configuração passa a se chamar "Settings" em
todos os pontos visíveis e no código (arquivo, componente, labels, rota). As sub-tabs internas
permanecem.

## User Scenarios & Testing

### User Story 1 — Navegação e header dizem "Settings"
Como usuário, quero ver "Settings" no menu e no cabeçalho da página, para uma nomenclatura
consistente com o restante do produto.

**Fluxo**: abre o menu → item "Settings" → a página abre com título "Settings" e as mesmas sub-tabs.

**Aceite**: menu e header mostram "Settings"; nenhuma referência órfã a "Config" na navegação;
imports atualizados.

### Edge Cases
- Renomear `ConfigPage.tsx` → `SettingsPage.tsx` sem quebrar imports.
- Rota/label do menu atualizados sem link morto.
- Sub-tabs (Runtime, Defaults, etc.) preservadas.

## Requirements

### Functional Requirements
- **FR-001**: `ConfigPage.tsx` DEVE ser renomeado para `SettingsPage.tsx` (arquivo e componente).
- **FR-002**: O item de navegação, a rota/label e o título (`PageHeader`) DEVEM passar a "Settings".
- **FR-003**: Todos os imports e referências DEVEM ser atualizados; sem referência órfã a "Config"
  na navegação.
- **FR-004**: As sub-tabs existentes DEVEM ser preservadas.

### Key Entities
- **SettingsPage** (ex-`ConfigPage`): página de configuração renomeada.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Menu e header exibem "Settings" (UI focada).
- **SC-002**: `rtk npm run typecheck` passa (imports atualizados, sem referência órfã).

## Dependencies & Open Decisions
- **Depende de**: — (independe, mas natural após SET-10).

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/pages/ConfigPage.tsx` (→ `SettingsPage.tsx`), `src/web/client/App.tsx`,
  `src/web/client/components/navigation/Sidebar.tsx`, `PageHeader` title, rota/label do menu.
- **Validação**: `rtk npm run typecheck` + UI focada.
