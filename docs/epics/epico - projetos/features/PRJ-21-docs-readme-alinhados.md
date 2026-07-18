# Feature Specification: Documentação e governança alinhadas ao modelo final

**Feature Branch**: `docs/prj21-projects-model`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M7
**Depende de**: M1–M6 concluídos, PRJ-20

## Objetivo

Alinhar toda a documentação e governança ao modelo final Project → Epic → Work
Item → Task: README, constituição, `.claude/rules`, exemplos e help do CLI passam
a descrever o produto multi-repo com DB autoritativo, e a validação de docs
(`verify:doc-refs`) passa a barrar termos obsoletos. É a feature de fechamento do
épico — sem código de produto novo, só docs + guarda de validação.

## Contexto de execução

O README atual descreve o produto **single-repo** e o modelo antigo. Sua estrutura
(`README.md`): "What It Does" (`:11`), "Command Reference" (`:125`, comandos
`msq init/run/resume/decompose/skills/status/stats/ui/web/daemon`), "Backlog Model"
(`:279`), "Settings Ownership: App, Projeto, and Feature" (`:353`) e "Defaults and
Inheritance" (`:421`). Precisa refletir: novo `msq projects`/`epics`/`work-items`
(PRJ-03B), `db backup`/`backlog export` (PRJ-20), seleção local por cliente
(PRJ-10), roteamento de cwd por repo (PRJ-15B), archive/delete/restore (PRJ-17–19)
e rename "Project defaults" → "Repository defaults" (ROADMAP §Terminologia; hoje o
termo "Projeto" aparece em `:353`).

Guarda de validação já existe e é o ponto de extensão: `verify:doc-refs`
(`scripts/verify-doc-references.mjs`, `package.json:28`), agregado em
`verify:repo` = `doc-refs && skill-shims && backlog` (`package.json:31`). Esta
feature amplia `verify-doc-references.mjs` para validar os links do épico e
**recusar termos proibidos/obsoletos** (ex.: "Project defaults" fora de nota de
compatibilidade, símbolos `Demand*`/`BacklogItem*`, paths absolutos/referências ao
vault em docs canônicos do repo).

Regras do repo a atualizar vivem em `.claude/rules/` (`repo-context.md`,
`architecture.md`, `git-workflow.md`, `testing.md`, `harness.md`) — a fonte de
verdade operacional que o próprio agente lê. Compatibilidade de nomes: `Work Item`
é o termo canônico; `backlog_features`/`feature_id` ficam identificados como
persistência legada (ROADMAP §Compatibilidade), não removidos.

## Modelo técnico

- Reescrita/expansão de seções do `README.md`: Command Reference (`:125`), Backlog
  Model (`:279`), Settings Ownership (`:353` → Repository defaults), + novas seções
  de Project/multi-repo, ciclo de vida e backup/export.
- `.claude/rules/*` atualizados ao modelo final (sem contradição entre si).
- `scripts/verify-doc-references.mjs` (`package.json:28`) ganha validação de links
  do épico + lista de termos proibidos/obsoletos; segue em `verify:repo` (`:31`).
- Runbook (backup/restore, migração, rollback, recuperação de repo path) como doc
  versionada.

## Requirements

- Atualizar README, constituição, `.claude/rules`, exemplos e help do CLI.
- Documentar DB como estado operacional; specs/ADRs como intenção; YAML v2/v3 como import/export.
- Substituir "Project defaults" legado por "Repository defaults" em UX/docs e registrar aliases temporários de código.
- Documentar Project→Epic→Work Item→Task, repo alvo, type, templates, archive/delete e restore.
- Documentar `Work Item` como termo canônico e `feature|bug` como Work Item types; `backlog_features`/`feature_id` ficam identificados como persistência legada.
- Documentar daemon global, seleção local por cliente, roteamento de cwd e health de repos.
- Incluir runbook de backup/restore, migração, rollback e recuperação de repo path.
- Remover paths absolutos/referências ao vault de documentos canônicos do repo.
- `verify:doc-refs` passa a validar links do épico e termos proibidos/obsoletos.

## Arquivos afetados

- `README.md` — Command Reference (`:125`), Backlog Model (`:279`), Settings
  Ownership (`:353`), novas seções de Project/lifecycle/backup.
- `.claude/rules/*.md` — `repo-context.md`, `architecture.md`, `git-workflow.md`,
  `testing.md`, `harness.md` alinhados ao modelo final.
- `scripts/verify-doc-references.mjs` — validação de links do épico + termos
  proibidos (`package.json:28`, `:31`).
- `docs/` — runbook de backup/restore/migração/rollback; ADR/constituição (PRJ-00).
- `src/commands/*` — textos de `--help` alinhados (sem mudança de comportamento).

## Success Criteria

- README e help permitem instalar, migrar, criar Project, vincular repo, criar Work Item, executar, arquivar e fazer backup sem consultar código.
- Nenhuma regra chama defaults por repo de Project sem nota de compatibilidade.
- Links internos, exemplos YAML e comandos são executáveis/validados em teste.
