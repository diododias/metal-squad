# F44 — Central de Configuracoes do Projeto (Multi-Projeto, Multi-Repo, Workflow, Skills, Telegram, Notificacoes)

**Tipo**: Feature
**Status**: Pendente — triagem
**Prioridade sugerida**: Alta
**Relaciona**: F22 (Per-Repo Config), F21 (Setup Wizard), F19 (Notifications v2), F40

## Relato do usuario (2026-07-11)

> Configuracoes do projeto configuraveis: Steps/Workflow, Skills por
> workflow, Projetos, Telegram, Notificacoes
> Permitir cadastrar mais de um projeto
> selecionar repositorios por projeto permitindo ter mais de um repositorio
> no projeto

## Problema

Hoje a config parece amarrada a um unico projeto/repo. O pedido e uma tela
central de configuracoes cobrindo: workflow/steps (ver F40), skills por
workflow, cadastro de multiplos projetos, cada projeto com um ou mais
repositorios, config de Telegram e de notificacoes em geral.

Este item e o maior em escopo do lote — provavelmente deve ser quebrado em
sub-features menores durante o planejamento (ex.: F44a multi-projeto/
multi-repo, F44b hub de configuracoes UI) antes de virar trabalho executavel.

## Escopo provavel

- `src/config/` — modelo de config hoje (per-repo, `.claude/rules/repo-context.md`
  nao cobre multi-projeto explicitamente)
- `src/db/` — schema de projetos/repos (hoje parece 1 repo por instancia)
- `src/web/static/components/` — nova tela de configuracoes
- `src/core/skills/` — precedence de skills por workflow (repo > global >
  external > builtin, ja documentado em `.claude/rules/architecture.md`)

## Proximo passo

Antes de implementar, mapear o quanto do modelo atual (`src/db/`,
`src/config/index.ts`) assume "um repo/projeto" implicitamente — isso deve
virar uma feature separada de migracao de schema, provavelmente com prefixo
proprio (F44 + sub-itens) dado o tamanho.
