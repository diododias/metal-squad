# Repo Context

## Produto

`metal-squad` (`msq`) e um orquestrador de pipelines de desenvolvimento assistido por IA.

O produto hoje combina:

- backlog YAML versionado no repo
- selecao de features por dependencias
- adapters headless (`claude`, `codex`, `opencode`)
- persistencia SQLite de runs/tokens/gates
- TUI em Ink para acompanhar execucoes

## Fontes de verdade

Leia nesta ordem quando precisar de contexto funcional:

1. `README.md` para setup e comandos reais
2. `docs/ROADMAP.md` para fases, dependencias, backlog operacional e hotfixes
3. `docs/features/Fxx-*.md` para escopo de feature
4. `docs/hotfixes/Hxx-*.md` para bugs operacionais ja descobertos
5. `backlog.yaml` para configuracao executavel atual
6. codigo e testes em `src/` e `tests/`

## Fontes que hoje NAO sao verdade

- `docs/ARCHITECTURE.md` esta placeholder; nao use como base de decisao sem validar no codigo.

## Mapa rapido do repo

- `src/cli.ts`, `src/index.ts`: bootstrap do CLI
- `src/commands/`: comandos `init`, `run`, `skills`, `status`, `ui`
- `src/core/backlog/`: schema, loader e prompt builder
- `src/core/orchestrator/`: grafo e scheduler
- `src/core/adapters/`: integracao com ferramentas de execucao
- `src/core/skills/`: discovery, resolution e validation de skills
- `src/core/events/`: event bus, logging e notifications
- `src/db/`: SQLite, migracoes e queries
- `src/ui/`: TUI Ink
- `tests/`: suites por area
- `.claude/skills/` e `.agents/skills/`: skills locais do repo

## Como categorizar uma mudanca

- **Feature**: comportamento novo ou entrega planejada em `docs/features/`
- **Hotfix**: bug operacional descoberto durante uso/validacao do produto
- **Harness**: ajuste no fluxo de validacao do `msq` ou de uma skill que testa o proprio `msq`
- **Docs/Skills**: orientacao operacional e prompts locais

Se a mudanca nasce de uma falha real do orquestrador, deixe rastreio em `docs/hotfixes/` ou no item de feature operacional correspondente.
