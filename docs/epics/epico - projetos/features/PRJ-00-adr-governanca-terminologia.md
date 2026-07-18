# Feature Specification: ADR — governança, fonte de verdade e terminologia

**Feature Branch**: `docs/prj00-governanca-projetos`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M0

## Objetivo

Fechar a mudança conceitual antes da migração: DB como estado operacional,
artefatos versionados como intenção, `backlog.yaml` como import seed, e distinção
entre o novo Project e os atuais defaults por repo chamados “Project defaults”.

## Requirements

- Publicar roadmap, ADR e specs no repo antes da primeira implementação.
- Atualizar constituição, `repo-context`, README e templates Spec Kit afetados.
- Renomear conceitualmente `projectDefaults` para **Repository defaults**; a migração de nomes de código pode ser gradual, mas nenhum contrato novo pode ampliar a ambiguidade.
- Adotar **Work Item** como entidade canônica abaixo de Epic; `feature` e `bug` são valores de `WorkItemType`, não nomes da entidade.
- Usar `WorkItem`, `WorkItemCatalogEntry`, `workItemId`, `action:createWorkItem` e `msq work-items` em contratos novos.
- Manter `backlog_features`, `feature_id`, `FeatureSchema` e aliases `Feature*` como compatibilidade de persistência/código durante este épico, sem rename destrutivo.
- Não usar `Demand` nem `Backlog Item` como nome de domínio; backlog é uma visão/estado que contém Work Items.
- Manter herança de execução em dois níveis: Work Item→Repository defaults.
- Definir Project como agrupador de repos/epics e dono do mapa tipo→template.
- Registrar decisões: UUID v4, repo em no máximo um Project, Epic sem repo operacional, seleção ativa por cliente, delete lógico/tombstone e dependência cross-repo fora de escopo.
- Documentar estratégia de compatibilidade e rollback.

## Success Criteria

- Constitution Check passa sem exceções não justificadas.
- Não há uso ambíguo de “Project defaults”, `Demand` ou `Backlog Item` nos novos artefatos.
- Todos os PRJ apontam para caminhos versionáveis no repo.
- Decisões acima não permanecem como “sugerido”, “ou” ou “a decidir”.
