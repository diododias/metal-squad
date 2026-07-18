# Feature Specification: Seletor de Project por cliente

**Feature Branch**: `feat/prj10-project-selector`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M4
**Depende de**: PRJ-07

## Objetivo

Introduzir o conceito de **Project ativo por cliente**: um seletor na navegação
que define qual Project recorta Board/Runs/Gates/Analytics, persistido localmente
e **nunca** empurrado ao servidor. É a peça que torna a seleção uma preferência de
cada aba do navegador, não estado global compartilhado.

## Contexto de execução

Decisão de arquitetura (ROADMAP §Seleção ativa): `activeProjectId` é **estado por
cliente, persistido em `localStorage`**, não preferência global do servidor. Por
isso PRJ-07 deliberadamente **não** adicionou `activeProjectId` ao
`MsqWebState` — o servidor empurra o catálogo global (`projects[]`) e cada cliente
escolhe o seu.

O estado do client hoje é todo `useState` local em `App.tsx`
(`src/web/client/App.tsx:35-42`: `route`, `sidebarCollapsed`, `state`, etc.).
Não há Context API em uso para seleção. O seletor nasce como um novo
`ActiveProjectContext` (Provider em `App.tsx`) alimentado por `state.projects`
(PRJ-07) e por um valor persistido. A navegação onde o seletor aparece é a
`Sidebar` (`src/web/client/components/navigation/Sidebar.tsx:22`) e a barra mobile
equivalente.

Persistência: `localStorage` com **chave versionada** (ex.:
`msq.activeProjectId.v1`), para poder invalidar se o formato mudar. O fallback é
determinístico: ID salvo ainda válido → primeiro Project por `position` → `null`.
Project arquivado/deletado (some de `projects[]`) invalida a seleção e mostra
CTA. Sem nenhum Project, CTA para `/projects` (PRJ-08).

Consumo: Board/Runs/Gates/Analytics leem o mesmo contexto via um helper seletor
comum — a implementação do recorte real dessas telas é PRJ-16. Aqui entra só o
contexto + seletor + persistência.

## Modelo técnico

```ts
// contexto por cliente, não vai ao MsqWebState
const ActiveProjectContext = React.createContext<{
  activeProjectId: string | null;
  setActiveProject(id: string | null): void;
  activeProject: ProjectSummary | null;
}>(...);
```

- Provider em `App.tsx` inicializa lendo `localStorage['msq.activeProjectId.v1']`
  e aplica o fallback determinístico contra `state.projects`.
- `setActiveProject` grava no `localStorage` e nunca chama `send(...)`.
- `useEffect` reconcilia quando `projects[]` muda (ativo removido → invalida).
- Seletor renderizado na `Sidebar`/MobileTopBar.

## Requirements

- Criar `ActiveProjectContext` no cliente e seletor na Sidebar/MobileTopBar.
- Persistir `projectId` em chave versionada de localStorage; não enviar ação de seleção ao servidor.
- Fallback determinístico: ID salvo válido → primeiro Project por posição → `null`.
- Project arquivado/deletado invalida a seleção e apresenta mensagem/CTA.
- Sem Projects mostra CTA para `/projects`; um único Project continua visível.
- Board, Runs, Gates e Analytics consomem o mesmo contexto, implementado com PRJ-16.

## Arquivos afetados

- `src/web/client/App.tsx` — `ActiveProjectContext` Provider; init/reconcile
  (`:35-42` é onde o state local vive hoje).
- `src/web/client/hooks/useActiveProject.ts` (novo) — hook de leitura/escrita +
  localStorage versionado.
- `src/web/client/components/navigation/Sidebar.tsx` — render do seletor (`:22`).
- `tests/web/*` — localStorage, fallback, remoção do ativo, mobile.

## Success Criteria

- Dois clientes conectados selecionam Projects distintos sem interferência.
- Reload preserva seleção válida; ID inválido não quebra rotas/detalhes.
- Testes cobrem localStorage, fallback, remoção do ativo e mobile.
