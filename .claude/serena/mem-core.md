# Serena mem:core fallback

Use isto como fallback versionado enquanto a memoria `mem:core` do Serena nao estiver provisionada no ambiente.

## Invariantes duraveis

- Produto: `metal-squad` (`msq`) e um orquestrador de backlog assistido por IA.
- Fontes de verdade: `README.md`, `backlog.yaml`, `docs/features/*.md`, `docs/hotfixes/*.md`, `src/`, `tests/`.
- Fonte canonica de skills do repo: `.claude/skills/`.
- `.agents/skills/` e apenas shim de compatibilidade.
- UI oficial: `msq web`. A TUI em `src/ui/` esta aposentada e nao deve receber evolucao nova.

## Mapa de camadas

- `src/commands/`: entrada CLI e delegacao.
- `src/core/`: adapters, backlog, workflow, events, runner e regras centrais.
- `src/db/`: schema SQLite, migracoes e queries.
- `src/web/`: dashboard web oficial.
- `tests/`: cobertura por area.

## Comandos reais

- `rtk npm run build`
- `rtk npm test`
- `rtk npm run typecheck`
- `rtk npm run lint`
- `rtk node dist/index.js --help`

## Perigos

- Sempre prefixar shell com `rtk`.
- Nao criar worktree neste repo.
- Nao rodar nested `msq run` dentro de uma sessao spawnada pelo proprio `msq`.
- So usar `MSQ_DB_PATH` se o banco global falhar por permissao.

## Memorias especificas

- Regras do repo: `.claude/rules/*.md`
- Skill canonica de fluxo normal: `.claude/skills/dev-flow/SKILL.md`
- Harness dedicado do produto: `.claude/skills/msq-develop/SKILL.md`
