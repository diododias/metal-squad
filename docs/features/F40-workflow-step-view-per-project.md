# F40 — Visualizacao por Step + Workflow Customizavel por Projeto

**Tipo**: Feature
**Status**: Pendente — triagem
**Prioridade sugerida**: Alta
**Relaciona**: F24 (Task & Stage Progress), F22 (Per-Repo Config)

## Relato do usuario (2026-07-11)

> nao estou conseguindo ver que etapa esta
> Tela principal deve ter nova opcao de visualizacao por step do workflow
> Deve permitir customizar workflow por projeto

## Problema

Hoje nao e claro, olhando a tela principal, em qual step/etapa do workflow
(specify → plan → tasks → implement, etc.) uma feature esta. Alem disso o
workflow de steps parece ser fixo, sem opcao de customizacao por projeto/repo.

## Escopo provavel

- `src/core/backlog/` — schema/loader de workflow (steps validos, ordem)
- `src/ui/` (TUI) e `src/web/static/components/` (dashboard) — nova visao
  "por step" na tela principal/kanban, alem da visao atual
- `src/config/` ou `src/core/backlog/` — onde workflow por projeto seria
  persistido (provavel extensao de F22 per-repo config)

## Proximo passo

Investigar no codigo atual (`src/core/backlog/schema`, `docs/features/F24-*`)
como o step atual e computado e exposto hoje, antes de desenhar a nova visao
e o mecanismo de customizacao. Definir se "workflow por projeto" e um novo
campo de config ou uma extensao do `backlog.yaml`.
