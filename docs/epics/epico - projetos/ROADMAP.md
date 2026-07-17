# Épico Projetos — Roadmap

> Transformar o `msq` de orquestrador ancorado em um único `cwd` em uma ferramenta
> de gestão de projetos multi-repo. Hierarquia-alvo:
> `Project › Epic › Work Item (type: feature|bug, 1 repo) › Task`.
>
> Cada item `PRJ-*` é uma unidade de implementação/PR com aceite automatizável.
> O DB é a fonte do estado operacional; specs versionadas preservam a intenção e
> `backlog.yaml` é um asset de bootstrap/import, nunca uma reconciliação destrutiva.
> Atualizado em 2026-07-17 após validação contra o código em `develop`.

---

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Fonte de verdade | **DB = estado operacional autoritativo.** Specs/ADRs versionados = intenção e governança. `backlog.yaml` = import `seed`, com dry-run e conflitos explícitos. Backup/export deixam de ser opcionais. |
| Terminologia | O conceito atual “Project defaults”, armazenado por `repo_id`, passa a se chamar **Repository defaults**. O novo Project é o agrupador de repos/épicos e dono do mapa tipo→template. |
| Herança de execução | Work Item herda defaults do **repo alvo**. O Project não adiciona uma terceira camada de herança. Templates do Project são materializados como snapshot na criação. |
| Project × Repo | Um repo pertence a no máximo um Project por vez. Transferência usa `moveRepo` transacional; nunca unlink+link parcial. |
| Epic × Repo | Epic pertence ao Project e **não** possui repo operacional. `backlog_epics.repo_id` torna-se nullable/legado após reconstrução controlada da tabela. |
| Work Item × Repo | Cada Work Item (`type: feature|bug`) pertence a exatamente um repo vinculado ao Project do Epic. Dependência cross-repo é recusada neste épico. |
| Seleção ativa | `activeProjectId` é estado por cliente, persistido em `localStorage`; não é preferência global do servidor. |
| Status | Epic usa status manual `todo|in_progress|done`. Status do Work Item continua derivado das runs. |
| Ciclo de vida | Delete somente para Work Item/entidade **pristine** e usa tombstone/`deleted_at`, preservando IDs. Archive é permitido para item não-running; running exige cancelar antes. |
| Workflow templates | Template versionado combina `Workflow` + `stageSkills`. Work Item grava snapshot, `templateId` e `templateVersion`. Skills são validadas no repo alvo. |
| Compatibilidade de nomes | Domínio/UI/CLI/WS novos usam `WorkItem`/`workItemId`. Tabelas `backlog_features`, coluna `feature_id` e aliases `Feature*` permanecem temporariamente como persistência legada; não exigem rename destrutivo neste épico. |
| Segurança de paths | Repo informado pela web passa por `realpath`, validação de diretório, allowlist configurável e confirmação explícita antes de ser executável. |
| Contrato WS | Payloads validados em runtime, ações possuem `requestId` e resposta tipada; erros de domínio não usam `DbAccessError`. |

---

## Grafo de marcos

```text
M0 → M1 → M2 → M3 → M4 ┬→ M5 ─┐
                        └→ M6 ──┴→ M7
```

- Caminho crítico: **M0 → M1 → M2 → M3 → M4**.
- M5 (tipos/templates) e M6 (ciclo de vida) dependem de M4, mas não dependem entre si.
- A execução do trabalho no repo continua sequencial; “independentes” significa apenas ausência de dependência lógica.
- M7 é obrigatório para encerrar a mudança de fonte de verdade.

---

## M0 — Governança, publicação e vocabulário

- [PRJ-00 — ADR: fonte de verdade, Project × Repository e compatibilidade](features/PRJ-00-adr-governanca-terminologia.md)

**Validação M0:** material publicado no repo; constituição/regras sem contradição;
glossário distingue Project, Repository defaults, Epic, Work Item e Task; decisões de ID,
cardinalidade e herança fechadas.

---

## M1 — Persistência e bootstrap recuperável

- [PRJ-01 — Migração de schema e constraints](features/PRJ-01-migracao-schema-projeto.md)
- [PRJ-02 — Backfill de Project implícito](features/PRJ-02-backfill-projeto-implicito.md)
- [PRJ-03 — Services/queries de Project e vínculo de repos](features/PRJ-03-queries-projeto-repo.md)
- [PRJ-04 — Import seed não-destrutivo e relatório de conflitos](features/PRJ-04-import-nao-destrutivo.md)

**Validação M1:** backup automático; migração e backfill rodam 2×; `foreign_key_check`
e `integrity_check` passam; legado mantém runs; import repetido não sobrescreve nem
arquiva dados e apresenta conflitos determinísticos.

---

## M2 — Domínio headless: Projects, Epics e repos

- [PRJ-03B — CLI e application services do domínio](features/PRJ-03b-cli-dominio-projetos.md)
- [PRJ-05 — WS create/update de Project](features/PRJ-05-ws-actions-projeto.md)
- [PRJ-06 — WS link/move/unlink de repo](features/PRJ-06-ws-link-unlink-repo.md)
- [PRJ-11 — WS create/update de Epic e status manual](features/PRJ-11-ws-actions-epico.md)

Archive/delete ficam exclusivamente em M6. M2 entrega criação, leitura, edição,
vínculo e transferência segura.

**Validação M2:** via CLI e WS, criar Project, vincular dois repos, criar Epic,
editar descrição/status e transferir um repo vazio entre Projects com auditoria.

---

## M3 — Catálogo e execução multi-repo reais

- [PRJ-07 — Estado global de Projects e repos](features/PRJ-07-state-projects.md)
- [PRJ-14 — Criar Work Item com repo alvo](features/PRJ-14-criar-work-item-repo.md)
- [PRJ-15 — Catálogo agregado e escopo por Project](features/PRJ-15-catalogo-escopo-projeto.md)
- [PRJ-15B — Roteamento runtime por repo/cwd](features/PRJ-15b-runtime-routing-multi-repo.md)

**Validação M3:** com dois repos temporários, criar um Work Item em cada um; start,
resume, histórico, alterações Git, config e skill discovery usam o cwd correto;
dependência cross-repo é recusada com erro acionável.

---

## M4 — Experiência web de Projects, Epics e Kanban

- [PRJ-08 — Página `/projects`](features/PRJ-08-pagina-projects.md)
- [PRJ-09 — Configurar e diagnosticar repos](features/PRJ-09-ui-configurar-repos.md)
- [PRJ-10 — Seletor de Project por cliente](features/PRJ-10-seletor-projeto-global.md)
- [PRJ-12 — Detalhe do Project: Epics e Work Items](features/PRJ-12-detalhe-projeto-epicos.md)
- [PRJ-13 — Edição de Epic](features/PRJ-13-ui-editar-epico.md)
- [PRJ-16 — Kanban por Project/Epic com repo no card](features/PRJ-16-kanban-filtros-projeto-epico.md)

**Validação M4:** criar e operar um Project multi-repo pela web; dois clientes
mantêm seleções diferentes; Board/Runs/Gates/Analytics refletem o Project ativo;
repo indisponível aparece com diagnóstico e não inicia run.

---

## M5 — Work Item types e Workflow Templates

- [PRJ-22 — Work Item type `feature|bug`](features/PRJ-22-schema-work-item-type.md)
- [PRJ-23 — Persistência, versão e resolução de templates](features/PRJ-23-modelo-workflow-templates.md)
- [PRJ-24 — WS/state e snapshot na criação do Work Item](features/PRJ-24-ws-templates-criar-work-item.md)
- [PRJ-25 — Seletor/badge/preview de Work Item type](features/PRJ-25-ui-work-item-type.md)
- [PRJ-26 — Gestão de templates e mapa tipo→template](features/PRJ-26-ui-gestao-templates.md)

**Validação M5:** criar bug e feature em repos distintos; preview e snapshot
coincidem; editar template não muda itens existentes; template com skill ausente
no repo alvo é recusado antes da criação.

---

## M6 — Ciclo de vida, tombstones e restore

- [PRJ-17 — Policy engine e persistência archive/delete](features/PRJ-17-regras-archive-delete.md)
- [PRJ-18 — Ações de ciclo de vida na UI](features/PRJ-18-botoes-archive-delete-ui.md)
- [PRJ-19 — `/archived`, restore e auditoria](features/PRJ-19-tela-arquivados-restore.md)

**Validação M6:** running não pode ser arquivado/deletado; pristine pode ser
arquivado ou deletado logicamente; item com qualquer run terminal só pode ser
arquivado; restore valida ancestrais/repos; ID deletado nunca é reutilizado.

---

## M7 — Export, disaster recovery, documentação e E2E

- [PRJ-20 — Backup/restore e export DB→YAML v3](features/PRJ-20-backlog-export.md)
- [PRJ-21 — Docs, constituição e README alinhados](features/PRJ-21-docs-readme-alinhados.md)

**Validação M7:** backup→migração→restore testado; export representa Project/Epic
multi-repo sem duplicação; round-trip preserva campos ativos; `verify:repo`, suite
E2E de dois repos e baseline completa passam.

---

## Requisitos transversais

- Branch a partir de `develop`, sem worktree, `/dev-flow`, PR para `develop`.
- Mudança em `src/`: build, testes, typecheck e lint; comportamento web novo exige teste automatizado, não apenas smoke manual.
- Escritas relacionadas usam uma única transação e erros de domínio tipados/codificados.
- Toda ação mutável gera audit event com ator/sessão, entidade, operação e timestamp.
- Estado WS inclui `revision`; update destrutivo aceita revisão esperada para detectar concorrência.
- Consultas agregadas não leem specs/config/skills de todos os repos a cada tick; detalhes pesados são lazy/cached.
- IDs opacos são UUID v4; nomes/slugs são editáveis e nunca usados como chave relacional.
- Nenhum item deste épico adiciona comportamento à TUI.

## Fora de escopo, com validação explícita

- Um Work Item executando em N repos.
- Dependências e scheduler cross-repo; tentativa deve falhar antes de criar pipeline.
- Multiusuário/RBAC.
- Reconciliação automática bidirecional YAML↔DB.
- Tipos além de `feature|bug`.

## Resumo

- **8 marcos**, **29 specs** (`PRJ-00`, `PRJ-01`–`PRJ-26`, `PRJ-03B`, `PRJ-15B`).
- Caminho crítico real: **governança → dados → domínio → runtime multi-repo → web**.
- Export/backup/docs são parte da definição de pronto, não backlog opcional.
