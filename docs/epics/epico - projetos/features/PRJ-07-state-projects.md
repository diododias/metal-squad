# Feature Specification: Estado global de Projects e Repositories

**Feature Branch**: `feat/prj07-state-projects`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M3
**Depende de**: PRJ-03, PRJ-05, PRJ-06, PRJ-11

## Objetivo

Expor as novas entidades (Projects e Repositories) e seus resumos no estado
empurrado para a web **sem** transformar seleção de UI em estado global do
servidor e **sem** varrer filesystem/config/skills de todos os repos a cada tick.
Este item entrega apenas a **projeção de leitura** que o M4 vai consumir; a
criação de Work Items com repo alvo é PRJ-14 e o roteamento de execução é
PRJ-15B.

## Contexto de execução

A web é **state-push por WebSocket**, não REST: o servidor monta `MsqWebState` e
empurra `{ type: 'state:full', payload }` (`src/web/types.ts:249-250`); o cliente
só envia ações `action:*` (`src/web/types.ts:210-248`). Quem monta o estado é
`buildMsqWebState()` (`src/web/state.ts:261-306`).

O shape atual do estado é **single-repo**: `MsqWebState`
(`src/web/types.ts:77-108`) começa com `repoLabel: string` e não tem `revision`,
`projects[]` nem `repositories[]`. `buildMsqWebState` resolve **um** repo via
`resolveRepo()` (`src/web/state.ts:262`, de `src/core/repo.ts:12`) e deriva tudo
dele. O que nasce neste épico:

- `revision` no state (requisito transversal do ROADMAP: update destrutivo aceita
  revisão esperada para detectar concorrência) — hoje inexistente.
- `projects[]` e `repositories[]` como projeções de resumo.
- enriquecimento do catálogo de itens com `projectId`/`repoId`/`epicId`.

Pontos de atenção sobre custo por tick (o estado é remontado e reemitido a cada
mudança):

- `collectSkillsCatalog()` (`src/web/state.ts:247-259`) já é **lazy e cacheado**
  por TTL (`skillsCatalogCache`, `CONFIG_CACHE_TTL_MS`) e chama
  `createSkillRegistry().discover(process.cwd())` (`:252`), que toca filesystem
  (`.msq/skills`, `.claude/skills`, `.agents/skills`, global — ver
  `src/core/skills/registry.ts:124-130`). Esse padrão de cache por repo/revisão é
  o modelo a seguir para os novos resumos de repo (health, path, Git).
- `collectRuntimeConfig()` também é cacheado (`invalidateRuntimeConfigCache`,
  `src/web/state.ts:228-245`).

Já existe o segredo-guard: `sanitizeRuntimeConfig` (`src/web/state.ts:196-217`) e
o comentário em `MsqWebState.runtimeConfig` (`src/web/types.ts:99-105`) documentam
que credenciais bearer (URLs de canal, chat id) **não** podem chegar ao cliente
com `auth: 'none'`. O mesmo cuidado vale para `path` completo de repo.

Fontes das entidades novas: as queries/services de Project e vínculo de repo
criados em PRJ-03 (`listProjects`, `listProjectRepos`, contagens agregadas) e as
colunas snapshot de PRJ-01. Nada aqui deve reimplementar SQL — o estado só
projeta o que as queries retornam.

## Modelo técnico (projeção de estado)

Ampliar `MsqWebState` (`src/web/types.ts:77`) e `buildMsqWebState`
(`src/web/state.ts:261`):

```ts
interface MsqWebState {
  revision: number;               // novo: detecção de concorrência
  projects: ProjectSummary[];     // novo
  repositories: RepositorySummary[]; // novo
  // ... campos existentes preservados (runs, gates, featureCatalog, etc.)
}

interface ProjectSummary {
  projectId: string;
  name: string;
  description?: string | null;
  revision: number;
  counts: { epics: number; workItems: number; archived: number };
  activeRuns: number;
  tokens: TokenStats;             // agregado por Project
  archivedAt?: string | null;
}

interface RepositorySummary {
  repoId: string;
  label: string;                  // basename, nunca path completo por default
  projectId?: string | null;
  health: 'ok' | 'unavailable' | 'unchecked';
  lastCheckedAt?: string | null;
  path?: string;                  // só em contexto autorizado/tela apropriada
}
```

`FeatureCatalogEntry` (`src/ui/catalog.ts:13-52`) já tem `epicId` (`:19`); a
projeção ganha `projectId`, `repoId`, `repoLabel` e `workItemType`. Introduzir o
alias `WorkItemCatalogEntry` (novo nome de domínio); `FeatureCatalogEntry`
permanece como alias temporário (compatibilidade de nomes, ROADMAP §Decisões).

Resumos de repo (health/lastChecked) seguem o padrão lazy/cacheado de
`collectSkillsCatalog`: derivados de query SQLite no caminho quente; checks de
path/Git/tool são adiados e invalidados por revisão/configuração.

## Requirements

- `MsqWebState` recebe `revision`, `projects[]`, `repositories[]` e relações resumidas.
- Não adicionar `activeProjectId` ao state autoritativo. O cliente escolhe e persiste localmente (PRJ-10).
- `ProjectSummary` inclui counts ativos/arquivados, runs ativas, tokens agregados e revision.
- `RepositorySummary` inclui `repoId`, `label`, Project, health resumido e última verificação; `path` completo somente para cliente autenticado e tela apropriada.
- Introduzir `WorkItemCatalogEntry`; `FeatureCatalogEntry` pode permanecer como alias temporário. A projeção recebe `projectId`, `repoId`, `epicId`, repo label e `workItemType`.
- Resumos vêm de queries SQLite. Checks de path/Git/tool/skills são lazy, cacheados por repo e invalidados por revisão/configuração (mesmo padrão de `collectSkillsCatalog`/`collectRuntimeConfig`).
- Projetos arquivados não entram na lista padrão, mas são consultáveis para PRJ-19.

## Arquivos afetados

- `src/web/types.ts` — ampliar `MsqWebState` (`:77`); novos `ProjectSummary`,
  `RepositorySummary`, `WorkItemCatalogEntry`; `revision` no state.
- `src/web/state.ts` — `buildMsqWebState` (`:261`) projeta `projects`,
  `repositories`, `revision`; helpers de resumo lazy/cacheados no padrão de
  `collectSkillsCatalog` (`:247`).
- `src/ui/catalog.ts` — enriquecer `FeatureCatalogEntry` (`:13`) com `projectId`,
  `repoId`, `repoLabel`, `workItemType`; exportar alias `WorkItemCatalogEntry`.
- `src/db/repo.ts` / `src/db/backlogCatalog.ts` — reusar queries de PRJ-03 para
  contagens agregadas e resumos (sem SQL novo na camada web).
- `tests/web/state.test.ts` (ou equivalente) — serialização, ausência de
  segredo/path, dois clientes, custo por tick.

## Success Criteria

- Dois clientes recebem o mesmo catálogo global e mantêm seleções locais diferentes.
- Montar `state:full` não lê specs/config/skills de N repos por segundo (resumos vêm do DB; checks pesados são cacheados por repo/revisão).
- Projeto/repo arquivado ou ausente não quebra a serialização.
- Contract test impede retorno acidental de segredo/`path` em contexto não autorizado.
