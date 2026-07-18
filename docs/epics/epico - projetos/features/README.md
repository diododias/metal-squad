# Features — Épico Projetos

Specs do épico `Project › Epic › Work Item (type: feature|bug, 1 repo) › Task`.
Cada arquivo representa uma unidade de implementação/PR com aceite automatizável.
O agrupamento e as decisões transversais estão em [`../ROADMAP.md`](../ROADMAP.md).

## M0 — Governança

- [PRJ-00 — ADR, fonte de verdade e terminologia](PRJ-00-adr-governanca-terminologia.md)

## M1 — Persistência e bootstrap

- [PRJ-01 — Migração de schema](PRJ-01-migracao-schema-projeto.md)
- [PRJ-02 — Backfill de Project implícito](PRJ-02-backfill-projeto-implicito.md)
- [PRJ-03 — Queries/services de Project e repos](PRJ-03-queries-projeto-repo.md)
- [PRJ-04 — Import seed não-destrutivo](PRJ-04-import-nao-destrutivo.md)

## M2 — Domínio headless

- [PRJ-03B — CLI do domínio](PRJ-03b-cli-dominio-projetos.md)
- [PRJ-05 — WS create/update de Project](PRJ-05-ws-actions-projeto.md)
- [PRJ-06 — WS link/move/unlink repo](PRJ-06-ws-link-unlink-repo.md)
- [PRJ-11 — WS create/update de Epic](PRJ-11-ws-actions-epico.md)

## M3 — Runtime multi-repo

- [PRJ-07 — Estado global de Projects](PRJ-07-state-projects.md)
- [PRJ-14 — Criar Work Item com repo alvo](PRJ-14-criar-work-item-repo.md)
- [PRJ-15 — Catálogo agregado e escopo](PRJ-15-catalogo-escopo-projeto.md)
- [PRJ-15B — Roteamento runtime repo/cwd](PRJ-15b-runtime-routing-multi-repo.md)

## M4 — Web

- [PRJ-08 — Página `/projects`](PRJ-08-pagina-projects.md)
- [PRJ-09 — Configurar/diagnosticar repos](PRJ-09-ui-configurar-repos.md)
- [PRJ-10 — Seletor por cliente](PRJ-10-seletor-projeto-global.md)
- [PRJ-12 — Detalhe do Project](PRJ-12-detalhe-projeto-epicos.md)
- [PRJ-13 — Edição de Epic](PRJ-13-ui-editar-epico.md)
- [PRJ-16 — Kanban Project/Epic](PRJ-16-kanban-filtros-projeto-epico.md)

## M5 — Tipos e templates

- [PRJ-22 — Work Item type feature/bug](PRJ-22-schema-work-item-type.md)
- [PRJ-23 — Modelo/versionamento de templates](PRJ-23-modelo-workflow-templates.md)
- [PRJ-24 — WS/state e snapshot do Work Item](PRJ-24-ws-templates-criar-work-item.md)
- [PRJ-25 — UI de Work Item type e preview](PRJ-25-ui-work-item-type.md)
- [PRJ-26 — Gestão de templates](PRJ-26-ui-gestao-templates.md)

## M6 — Ciclo de vida

- [PRJ-17 — Policy engine e tombstones](PRJ-17-regras-archive-delete.md)
- [PRJ-18 — Ações na UI](PRJ-18-botoes-archive-delete-ui.md)
- [PRJ-19 — Arquivados e restore](PRJ-19-tela-arquivados-restore.md)

## M7 — Recovery e encerramento

- [PRJ-20 — Backup/restore e export v3](PRJ-20-backlog-export.md)
- [PRJ-21 — Docs/README/constituição](PRJ-21-docs-readme-alinhados.md)

> Caminho crítico: `M0 → M1 → M2 → M3 → M4`; M5 e M6 seguem M4; M7 encerra o épico.
