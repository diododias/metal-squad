# Repo Context

## Produto

`metal-squad` (`msq`) e um orquestrador de pipelines de desenvolvimento assistido por IA.

O produto hoje combina:

- backlog YAML versionado no repo
- selecao de features por dependencias
- adapters headless (`claude`, `codex`, `opencode`)
- persistencia SQLite de runs/tokens/gates
- TUI em Ink para acompanhar execucoes (**aposentada desde 2026-07-13** — ver abaixo)
- dashboard web (React/JSX) como interface oficial de UI/UX

### TUI aposentada (2026-07-13)

A TUI (`src/ui/`) parou de receber evolucao nova. Continua no repo e
funcional (`msq ui` nao foi removido), mas nenhuma feature/melhoria/hotfix
nova deve ser direcionada a ela — o `msq web` e a interface oficial daqui
pra frente. Se uma tarefa tocar algo exclusivo da TUI, o padrao passa a ser
**remover** esse trecho em vez de mante-lo ou evolui-lo. Contexto completo
e lista de capacidades da TUI ainda sem equivalente no web (candidatas a
migracao) estao no roadmap (ver Fontes de verdade abaixo).

## Fontes de verdade

Leia nesta ordem quando precisar de contexto funcional:

1. `README.md` para setup e comandos reais
2. `backlog.yaml` para configuracao executavel atual
3. `docs/features/Fxx-*.md` para escopo de feature ainda valido no repo
4. `docs/hotfixes/Hxx-*.md` para bugs operacionais ja descobertos
5. codigo e testes em `src/` e `tests/`
6. `docs/ROADMAP.md` apenas como aviso de transicao, nunca como backlog vivo

## Fontes que hoje NAO sao verdade

- `docs/ARCHITECTURE.md` esta placeholder; nao use como base de decisao sem validar no codigo.
- qualquer roadmap/historico antigo fora do repo; novas referencias devem apontar apenas para specs versionadas publicadas

## Mapa rapido do repo

- `src/cli.ts`, `src/index.ts`: bootstrap do CLI
- `src/commands/`: comandos `init`, `run`, `skills`, `status`, `ui`
- `src/core/backlog/`: schema, loader e prompt builder
- `src/core/orchestrator/`: grafo e scheduler
- `src/core/adapters/`: integracao com ferramentas de execucao
- `src/core/skills/`: discovery, resolution e validation de skills
- `src/core/events/`: event bus, logging e notifications
- `src/db/`: SQLite, migracoes e queries
- `src/ui/`: TUI Ink (aposentada — sem evolucao nova, ver secao acima)
- `tests/`: suites por area
- `.claude/skills/`: fonte canonica das skills locais do repo
- `.agents/skills/`: apenas shim de compatibilidade para discovery legado

## Como categorizar uma mudanca

- **Feature**: comportamento novo ou entrega planejada em `docs/features/`
- **Hotfix**: bug operacional descoberto durante uso/validacao do produto
- **Harness**: ajuste no fluxo de validacao do `msq` ou de uma skill que testa o proprio `msq`
- **Docs/Skills**: orientacao operacional e prompts locais

Se a mudanca nasce de uma falha real do orquestrador, deixe rastreio em `docs/hotfixes/` ou no item de feature operacional correspondente.
