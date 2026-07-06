# E05 — Developer Experience

## Motivacao

Setup e configuracao sao manuais. O sistema de adapters eh hardcoded a 3 tools. A configuracao por repo eh limitada. Falta um wizard interativo, plugin system, e profiles.

## Objetivo

Tornar o msq facil de adotar, configurar, e estender — tanto para novos usuarios quanto para power users que querem integrar suas proprias ferramentas.

## Features

- [F20 — Plugin System para Adapters](../features/F20-plugin-adapters.md)
- [F21 — Interactive Setup Wizard](../features/F21-setup-wizard.md)
- [F22 — Per-Repo Config Overrides](../features/F22-per-repo-config.md)
- [F23 — CLAUDE.md / Agent Config Generation](../features/F23-agent-config-gen.md)

## Impacto

- `src/core/adapters/` — refactor para plugin system
- `src/config/` — merge logic (global + repo-level)
- `src/commands/` — novo comando `setup` interativo
