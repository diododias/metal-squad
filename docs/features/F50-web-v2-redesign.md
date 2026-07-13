# F50 — Web v2 Redesign (React/JSX, multi-pagina)

**Epic**: [E06 — Web Version](../epics/E06-web-version.md)
**Prioridade**: Alta
**Esforco**: High
**Depende de**: F32, F34, F36, F42

## Problema

O frontend web (F32) era um clone de tela unica da TUI: React 18 via CDN/import-map, componentes escritos com `React.createElement` (sem JSX, sem bundler), e um unico `view` state alternando conteudo em vez de rotas reais. Isso limitava a evolucao visual da interface e nao acompanhava o design system definido para o produto.

## Objetivo

Substituir o frontend web pelo design v2 ("Metal Squad — Design System"), com build step real (JSX + esbuild), biblioteca de componentes compartilhados, roteamento por hash com 6 paginas reais (Board, Runs, Run Detail, Gates, Analytics, Config) e paridade de dados com o backend existente — sem alterar o contrato de eventos/acoes ja estabelecido em F32.

## Escopo entregue

### 1. Pipeline de build

- `esbuild` como devDependency; `react-dom`/`@types/react-dom` adicionados (`react`/`@types/react` ja existiam para a TUI Ink).
- `esbuild.web.mjs` (raiz do repo): bundla `src/web/client/index.tsx` → `dist/web/static/app.js` (ESM, target `es2022`, jsx transform, sourcemaps). React/react-dom bundlados — sem CDN, sem import-map.
- `package.json` `build`: `tsc && rm -rf dist/web/static dist/web/client && cp -r src/web/static dist/web/static && node esbuild.web.mjs && chmod +x dist/index.js`. O `rm -rf dist/web/client` remove o emit do `tsc` para a arvore do client (usado so para typecheck; o bundle real vem do esbuild direto do `.tsx`).
- `tsconfig.json`: `lib` ganhou `"DOM"`/`"DOM.Iterable"` — o mesmo tsconfig cobre backend Node e client browser, sem tsconfig separado.
- Eslint ja cobria `src/**/*.{ts,tsx}` com `projectService`/react hooks plugins; nenhuma mudanca necessaria para `src/web/client/**/*.tsx`.

### 2. Design tokens e assets (`src/web/static/`)

- `tokens/{colors,fonts,typography,spacing,base}.css` + `styles.css` (entry point de imports) portados do design kit.
- `assets/fonts/` — IBM Plex Mono (Regular/Medium/SemiBold/Bold) + VT323.
- `index.html` sem import-map (react bundlado): `<link rel="stylesheet" href="/static/styles.css">` + `<script type="module" src="/static/app.js">`.
- Frontend vanilla-JS anterior removido por completo (`src/web/static/{app.js,components/*.js,lib/*.js}`), substituido pela arvore `src/web/client/`.

### 3. Biblioteca de componentes — `src/web/client/components/`

Portados do design kit para TSX tipado (JSX classico, `import React from 'react'` por arquivo, `jsx: "react"` runtime):

- `core/`: `Button`, `Card`, `StatusPill`, `Tag`
- `data/`: `Table`, `MetricCard`, `ProgressBar`, `KanbanCard`, `BarList`, `TrendBars`
- `navigation/`: `Sidebar`, `Tabs`, `WorkflowStepper`
- `feedback/`: `Toast`, `Modal`, `ApprovalBanner`, `NotificationList`
- `transcript/`: `AgentTranscript`, `ToolCallCard`, `AgentMessage`
- `FeatureConfigDetail.tsx`: painel Execucao/Spec/Workflow/Retry/Steps por feature, reutilizado por `BacklogItemDetail` e pela aba Features & Prompts do Config. Inclui o editor de prompt/skills por etapa do workflow (`workflow.stepGuidance.<stage>.{skills,prompt}`), o ponto central deste redesign.

### 4. App shell — `src/web/client/App.tsx`

- Roteamento por hash: `#/board`, `#/runs`, `#/runs/:featureId`, `#/backlog/:featureId`, `#/gates`, `#/analytics`, `#/config`.
- Atalhos `g` + letra para navegacao, overlay de ajuda (`?`), `Esc` fecha overlays.
- `Sidebar` persistente (desktop) / `MobileTopBar` + `MobileTabBar` (`useIsMobile`, breakpoint 860px; `?mobile=1` forca o shell mobile para teste).
- Toggle de scanlines (`[data-scanlines]`), estado em memoria (nao persistido).
- WebSocket real via `hooks/useWebSocket.ts` (handshake de auth, reconexao, fila de mensagens pendentes) e `hooks/useLocalOutput.ts` (normalizacao de payload legado do opencode) — portas tipadas do `app.js` anterior contra `WebSocketClientMessage`/`WebSocketServerMessage`/`MsqWebState` (`src/web/types.ts`), sem alterar o contrato de F32.

### 5. Paginas — `src/web/client/pages/`

- **BoardPage**: kanban por status ou por etapa do workflow, busca + filtro de tool, coluna todo a partir de `state.pendingFeatures`.
- **RunDetailPage**: breadcrumb, acoes pause/resume/abort (gated em `run.pipelineStatus`), `ApprovalBanner` ligado a `resolveStageRequest`/`resolveGate`, grid de metricas, 5 abas (Run Summary/Feature Spec/Workflow/Feature Config/Live Output).
- **BacklogItemDetail**: preview de feature ainda nao iniciada + botao start + `FeatureConfigDetail`.
- **RunsPage**: tabela ordenavel (started/tokens/status) de todas as runs.
- **GatesPage**: lista centralizada de gates + stage requests com advance/hold/retry inline.
- **AnalyticsPage**: totais de tokens/sessao + tendencia dia/semana/mes + ranking de tokens por feature, calculado client-side a partir de `state.dashboard.rows`.
- **ConfigPage**: 6 sub-abas (Runtime/Defaults/Features & Prompts/Skills/Notifications/Budget). Runtime/Notifications/Budget leem `state.runtimeConfig` (novo); Skills le `state.skillsCatalog` (novo); Features & Prompts e master-detail sobre `state.featureCatalog` reusando `FeatureConfigDetail`.

### 6. Mudancas de backend (aditivas, sem quebrar contrato existente)

- `src/web/types.ts`: `MsqWebState` ganhou dois campos somente-leitura:
  - `runtimeConfig: Config` (de `src/config/index.ts`, sem segredos — URLs de webhook sao config local do usuario, nao credencial emitida pelo msq)
  - `skillsCatalog: Skill[]` (de `createSkillRegistry().discover(cwd)`, precedence ja aplicada: repo > global > external > builtin)
  - `FeatureConfigPatch.workflow` ganhou `stepGuidance?: Record<string, { skills?: string[]; prompt?: string }>` — o merge em `mergeFeaturePatch` (`src/db/backlogCatalog.ts`) ja fazia shallow-merge de `patch.workflow` sobre `current.workflow`, entao nenhuma mudanca de merge foi necessaria; o client envia o `stepGuidance` completo (spread + etapa editada).
- `src/web/state.ts`: `collectRuntimeConfig()` (try/catch → `ConfigSchema.parse({})`) e `collectSkillsCatalog()` (try/catch → `[]`), ligados em `buildMsqWebState()`.

## Escopo cortado (confirmado com o usuario)

- **Theme switching removido.** O v1 lia `state.theme.roles` e aplicava como CSS custom properties (`msq config theme` dark/light/minimal/default funcionava no web). O design v2 e uma paleta unica fixa "90s hacker terminal" dark, sem alternancia. `MsqWebState.theme` continua existindo no backend (nao lido pelo client novo). Cortado deliberadamente, confirmado com o usuario nesta sessao.
- **Command Palette nao reconstruido** — o design kit tambem nao o reconstruiu (nao se encaixa numa IA multi-pagina do jeito que se encaixava na console de tela unica).
- **AnalyticsPage sem ranking "tokens by task"** (o mock tem por-feature e por-task). Agregacao real por task entre todas as runs nao estava disponivel de forma limpa nas queries existentes de `db/repo.ts` dentro do escopo desta entrega.
- **Atalhos extras do Run Detail** (`Tab` entre sub-abas, `Ctrl+S` pause/resume output, `Ctrl+L` toggle logs) documentados no `HelpOverlay.tsx` mas nao vinculados — mesma lacuna que o design kit ja sinalizava no proprio readme.

## Validacao

- `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck`, `rtk npm run lint` — verdes.
- Validacao live via `msq web` (banco global default, sem `MSQ_DB_PATH`) navegando pelas 6 paginas com dados reais: Board (kanban por status, busca, filtro), Runs (tabela ordenavel), Run Detail (5 abas incluindo o editor de stage-prompt em Feature Config e o Live Output com transcript real de tool calls), Gates (estado vazio correto), Analytics (metricas + trend chart + ranking por feature), Config (6 sub-abas, incluindo Runtime/Skills lendo os novos campos `runtimeConfig`/`skillsCatalog`).
- Shell mobile verificado em 414x896 (breakpoint 860px): top bar + tab bar inferior, Board com colunas roladas horizontalmente, Config com master-detail funcional (levemente apertado, sem quebra).
- Sem erros no console do navegador durante a navegacao (warnings observados eram de extensao do Chrome, nao da aplicacao).
- **Nao validado nesta sessao**: acoes de pause/resume/abort/gate contra uma run real em andamento — nao havia run ativa no banco global no momento da validacao (0 em progresso). Os botoes existem e sao gated em `run.pipelineStatus` (confirmado por leitura de codigo), mas o clique-fim-a-fim contra uma run real fica como validacao pendente da proxima vez que houver uma run ativa.

## Areas tecnicas afetadas

- `src/web/client/` — novo modulo (App shell, paginas, componentes, hooks).
- `src/web/static/{tokens,assets}/` — novos tokens de design e fontes.
- `src/web/static/index.html`, `src/web/static/styles.css` — reescritos para o novo client.
- `src/web/static/{app.js,components/*.js,lib/*.js}` — removidos (frontend v1).
- `src/web/state.ts`, `src/web/types.ts` — `runtimeConfig`, `skillsCatalog`, `stepGuidance`.
- `esbuild.web.mjs`, `package.json` (`build` script, deps), `tsconfig.json` (`lib`).

## Criterios de aceite

- [x] Build gera `dist/web/static/app.js` via esbuild a partir de `src/web/client/index.tsx`.
- [x] 6 paginas reais navegaveis por rota hash com dados reais do backend.
- [x] Editor de prompt/skills por etapa (`stepGuidance`) funcional em Run Detail e Config.
- [x] Shell mobile responsivo abaixo de 860px.
- [x] `runtimeConfig`/`skillsCatalog` expostos em `MsqWebState` e consumidos por Config.
- [x] Frontend v1 (vanilla JS) removido sem perda de funcionalidade nao intencional, exceto os cortes de escopo documentados acima.
- [ ] Acoes pause/resume/abort/resolve-gate validadas contra uma run real em andamento (pendente — sem run ativa disponivel no momento da validacao).
