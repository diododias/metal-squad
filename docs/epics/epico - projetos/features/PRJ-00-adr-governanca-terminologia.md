# Feature Specification: ADR — governança, fonte de verdade e terminologia

**Feature Branch**: `docs/prj00-governanca-projetos`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M0
**ADR**: [`docs/adr/ADR-001-governanca-fonte-de-verdade-terminologia.md`](../../../adr/ADR-001-governanca-fonte-de-verdade-terminologia.md)

## Objetivo

Fechar a mudança conceitual antes da migração: DB como estado operacional,
artefatos versionados como intenção, `backlog.yaml` como import seed, e distinção
entre o novo Project e os defaults de execução por Repository, cujo identificador
de código atual `projectDefaults` permanece apenas como compatibilidade.

## Artefatos publicados

- [Roadmap do épico Projetos](../ROADMAP.md)
- [ADR-001 — Governança, fonte de verdade e terminologia](../../../adr/ADR-001-governanca-fonte-de-verdade-terminologia.md)
- Specs PRJ-01 a PRJ-26, PRJ-03B e PRJ-15B no mesmo diretório versionado.

## Requirements

- Publicar roadmap, ADR e specs no repo antes da primeira implementação.
- Atualizar constituição, `repo-context`, README e templates Spec Kit afetados.
- Renomear conceitualmente `projectDefaults` para **Repository defaults**; a migração de nomes de código pode ser gradual, mas nenhum contrato novo pode ampliar a ambiguidade. O identificador legado só aparece em notas de compatibilidade.
- Adotar **Work Item** como entidade canônica abaixo de Epic; `feature` e `bug` são valores de `WorkItemType`, não nomes da entidade.
- Usar `WorkItem`, `WorkItemCatalogEntry`, `workItemId`, `action:createWorkItem` e `msq work-items` em contratos novos.
- Manter `backlog_features`, `feature_id`, `FeatureSchema` e aliases `Feature*` como compatibilidade de persistência/código durante este épico, sem rename destrutivo.
- Não usar `Demand` nem `Backlog Item` como nome de domínio; backlog é uma visão/estado que contém Work Items. Identificadores de implementação legados só podem ser citados com essa qualificação.
- Manter herança de execução em dois níveis: Work Item→Repository defaults.
- Definir Project como agrupador de repos/epics e dono do mapa tipo→template.
- Registrar decisões: UUID v4, repo em no máximo um Project, Epic sem repo operacional, seleção ativa por cliente, delete lógico/tombstone e dependência cross-repo fora de escopo.
- Documentar estratégia de compatibilidade e rollback.

## Decisões fechadas

As decisões normativas estão consolidadas no ADR-001: fonte de verdade, herança
de execução, cardinalidade Project/Repository/Epic/Work Item, UUID v4, seleção
ativa por cliente, tombstones, templates versionados, contratos WebSocket e
dependências cross-repo fora de escopo.

## Success Criteria

- Constitution Check passa sem exceções não justificadas.
- Não há uso ambíguo de defaults de Project/Repository, `Demand` ou `Backlog Item` nos novos artefatos; ocorrências de aliases existentes estão marcadas como compatibilidade.
- Todos os PRJ apontam para caminhos versionáveis no repo.
- Decisões acima não permanecem como “sugerido”, “ou” ou “a decidir”.
