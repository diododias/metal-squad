# UX — Gestão de Projetos (Projeto → Épicos → Features)

Status: proposta para validação
Contexto: o Project Detail atual empilha tudo numa página (forms de criação inline, todos os épicos expandidos, workflow templates), sem hierarquia de navegação e sem respeitar os padrões visuais do restante do app (Board, Backlog Detail).

---

## 1. Princípios

- **Drill-down, não dump.** Cada nível mostra só o seu escopo: Projeto lista Épicos; Épico lista Features. Detalhe se acessa clicando.
- **Criação via modal.** `+ Novo Épico` e `+ Nova Feature` abrem o `Modal` existente (`components/feedback/Modal.tsx`). Nada de forms permanentes ocupando a página.
- **Identidade visual existente.** Reusar `PageHeader` (com slot `filters`, como o Board já faz), `Card`, `Tag`, `StatusPill`, `ProgressBar`, `Button`, tokens CSS (`--bg-panel`, `--font-mono`, etc.). Nenhum estilo novo ad-hoc.
- **Filtros no padrão do Board.** Selects no `PageHeader.filters`, mesmo estilo de `controlStyle`.

---

## 2. Fluxo de navegação

```
/projects
  └─ /projects/:projectId              (Detalhe do Projeto = lista de Épicos)
       └─ /projects/:projectId/epics/:epicId   (Detalhe do Épico = lista de Features)  ← NOVA ROTA
            └─ /projects/:projectId/epics/:epicId/items/:featureId
               (Detalhe da Feature em contexto — mesmo `BacklogItemDetail`, entregue em PF-14)
```

`/backlog/:featureId` continua existindo como entrada a partir do Board/Backlog,
com o breadcrumb atual — as duas entradas coexistem.

Breadcrumb sempre visível: `Projects › {Projeto} › {Épico}` (no detalhe do Work
Item aberto pela hierarquia, a trilha completa é clicável e o voltar retorna ao
`EpicDetailPage`).

---

## 3. Tela: Detalhe do Projeto (lista de Épicos)

**Header (`PageHeader`)**
- Título: nome do projeto. Breadcrumb: `Projects`.
- Actions: `+ Novo Épico` (primary) · `LifecycleActions` do projeto (archive/delete).
- Filters: busca por título · filtro de status: `todos | todo | em andamento | concluído` · ordenação (position | progresso).

**Corpo**
- Card compacto de resumo (descrição, repos, contagens, active runs) — 1 linha, colapsável.
- Lista de Épicos como **linhas clicáveis** (não cards gigantes expandidos):
  - Título · `StatusPill` (status manual) · `ProgressBar` derivado (done/total features) · tags de repo · nº features.
  - Clique → navega para Detalhe do Épico.
- Estado vazio: "Nenhum Épico. + Novo Épico".

**Filtro de status do Épico** — combinar duas fontes:
- `epic.status` (manual: todo / in_progress / done)
- derivado: `concluído` se progress N/N com N>0. Filtro usa o manual; mostrar badge quando manual ≠ derivado (ex.: manual todo mas 3/3 done) para incentivar atualização.

**O que sai desta tela**
- Form inline "Create Epic" → vira modal.
- Form inline "Create Work Item" → vai para o Detalhe do Épico (modal).
- Seção "Workflow Templates" → vai para aba/rota própria de configuração do projeto (ou tab "Settings" dentro do projeto). Não pertence ao fluxo de gestão.
- Cards de épico com features paginadas inline → removidos (viram a tela de detalhe).

**Modal: + Novo Épico**
- Campos: Título (obrigatório) · Descrição (opcional) · Position (opcional, default fim da lista).
- Ações: `criar` / `cancelar`. Erro inline no modal (`role="alert"`).
- Sucesso: fecha modal, toast de confirmação, épico aparece na lista.
- Reaproveitar: `action:createEpic` já existe; `EditableTextField`; lógica de requestId/actionResults do `EpicEditor`.

---

## 4. Tela: Detalhe do Épico (lista de Features) — NOVA

**Header (`PageHeader`)**
- Título: título do épico. Breadcrumb: `Projects › {Projeto}`.
- Actions: `+ Nova Feature` (primary) · `editar Épico` (abre modal com o `EpicEditor` existente) · `LifecycleActions` do épico.
- Filters: busca · status da run: `todos | não iniciada | running | blocked | done | failed` · tipo: `feature | bug` · repositório.

**Corpo**
- Barra de resumo: `ProgressBar` + `derived progress: N/M` + status manual.
- Lista de Features como linhas clicáveis:
  - `FeatureIdentity`/ID · título · `Tag` tipo · `Tag` repo · `StatusPill` da run · `WorkflowStepper` compacto · `DependencyTag`s · alerta de `integrityIssue`.
  - Clique → `/backlog/:featureId` (página já existente e completa).
- Paginação existente (PAGE_SIZE) mantida, aplicada pós-filtro.

**Modal: + Nova Feature**
- Campos: Título · Épico (pré-selecionado = épico atual, editável) · Repositório · Tipo (feature/bug).
- Preview do workflow template (reaproveitar `action:resolveWorkflowTemplate` + `WorkflowStepper` compact — já implementado no ProjectDetailPage atual, só mover para o modal).
- Botão `criar` desabilitado até título + repo + preview válido (regra atual mantida).
- Sucesso: fecha modal, toast, opção "abrir detalhe" para configurar spec/dependências no BacklogItemDetail.

---

## 5. O que já existe e será reaproveitado

| Peça | Onde | Uso |
|---|---|---|
| `Modal` | feedback/Modal.tsx | base dos modais de criação |
| `EpicEditor` | pages/EpicEditor.tsx | edição do épico (dentro de modal) |
| `BacklogItemDetail` | pages/ | detalhe da feature (spec, workflow, deps, type change) |
| `action:createEpic/createWorkItem/updateEpic` | server | backend pronto |
| `action:resolveWorkflowTemplate` | server | preview no modal de feature |
| Padrão de filtros | BoardPage | selects no PageHeader.filters |
| `ProgressBar`, `StatusPill`, `Tag`, `Card`, `Toast` | components | listas e feedback |
| `LifecycleActions` | components | archive/delete/restore em cada nível |
| Paginação | ProjectDetailPage/ProjectsPage | listas longas |

---

## 6. Gap — o que precisa ser desenvolvido

1. ~~**Rota de detalhe do Épico**~~ — **entregue (PF-01)**: rota `/projects/:projectId/epics/:epicId` + página `EpicDetailPage` com resumo (progresso derivado + status manual), linhas de Work Item clicáveis/navegáveis por teclado e paginação; breadcrumb provisório `Projects › {Projeto}` até PF-03.
2. ~~**Lista de Épicos com filtros**~~ — **entregue (PF-02 + PF-08)**: corpo do `ProjectDetailPage` refeito como lista de linhas de Epic clicáveis (progresso derivado, contagem de Work Items, tags de repo, `LifecycleActions` sem navegação, paginação); forms inline de criação removidos. PF-08 adiciona no `PageHeader.filters` (padrão BoardPage): busca case-insensitive por título, filtro de status manual (`all | todo | in_progress | done`) e ordenação (`position` | `progress` — fração done/total desc, empate por position). Filtros combinam entre si, paginação reseta e aplica pós-filtro, e vazio pós-filtro mostra "No matching Epics." (distinto de "No Epics yet."). Linha com manual ≠ derivado exibe `Tag` `derived: {status}` (sem sync automática — item 10 segue aberto).
3. ~~**Modal de criação de Épico**~~ — **entregue (PF-04)**: `CreateEpicModal` (`components/project/`) aberto pelo `+ Novo Épico` do header e do empty state; título obrigatório, descrição opcional, `creating…` bloqueia campos, sucesso fecha + toast `ok` via `ToastStack`, erro mantém o modal aberto com a mensagem real do servidor em `role="alert"`; `Esc`/click-fora/cancelar fecham sem criar.
4. ~~**Modal de criação de Feature**~~ — **entregue (PF-05)**: `CreateWorkItemModal` (`components/project/`) aberto por `+ Nova Feature` no detalhe do Epic (épico pré-selecionado, editável) e no detalhe do Project (épico selecionável); repo único saudável pré-seleciona, repo `unavailable` aparece desabilitado com motivo, projeto sem repo mostra o bloqueio; preview de workflow via `action:resolveWorkflowTemplate` re-resolve a cada mudança de epic/repo/tipo e `criar` só habilita com título + epic + repo + preview válido; sucesso fecha + toast com id do Work Item (ação "abrir detalhe" no toast fica para PF-07).
5. ~~**Lista de Features com filtros**~~ — **entregue (PF-09)**: `EpicDetailPage` ganha no `PageHeader.filters` (padrão BoardPage): busca por título/id, status de run (`all | not started | running | blocked | done | failed` — "not started" = sem run, via PF-10), tipo (`feature | bug`), repositório (opções derivadas dos `repoLabel` dos itens, incluindo `unresolved`) e ordenação (`backlog order | by status | by title`). Filtros combinam; paginação aplica pós-filtro e reseta ao filtrar; vazio pós-filtro mostra "No matching Work Items."; o progresso do resumo do épico ignora filtros (sempre o total).
6. ~~**Status "não iniciada" como pill própria**~~ — **entregue (PF-10)**: `StatusPill` ganha a variante neutra `not_started` (cor `--text-faint`, borda `--border-dim`, ícone `·`, sem spinner, label default "not started"). Call sites migrados onde o semântico é "sem run"/idle, não "abortada": Work Item sem run no `EpicDetailPage`, status manual `todo` de Epic (`ProjectDetailPage`, `EpicDetailPage`, `EpicEditor`) e "0 active runs" de Project (`ProjectsPage`, `ProjectDetailPage`). Runs realmente `aborted` mantêm o visual atual.
7. ~~**Realocar Workflow Templates**~~ — **entregue (PF-11)**: `ProjectDetailPage` ganha `Tabs` (`components/navigation/Tabs.tsx`): tab **Epics** (default — resumo + repositories + lista de épicos com filtros) e tab **Templates** (a `WorkflowTemplatesSection` como está, sem mudança de contrato). Filtros de PF-08 só aparecem na tab Epics e sobrevivem à troca de tab. Deep-link `#/projects/:id?tab=templates`; o parser de rotas (`lib/routes.ts`) passou a ignorar sufixo de query em qualquer rota (base para PF-18). Espaço futuro para tab "Settings" segue reservado (não-escopo).
8. ~~**Breadcrumb de 2 níveis**~~ — **entregue (PF-03)**: `PageHeader` aceita `BreadcrumbItem[]` (trilha N níveis clicável, retrocompatível com nó único); `EpicDetailPage` mostra `Projects › {Projeto}` e `ProjectDetailPage` migrou para o formato array.
9. ~~**Consistência de erro na criação**~~ — **entregue (PF-07)**: helper `lib/actionFeedback.ts` (`readActionOutcome`) extrai `ok/entity/error.message` tipado e é adotado por `CreateEpicModal`, `CreateWorkItemModal`, `EpicEditor` e `LifecycleActions` — nenhum fluxo de gestão resume/engole `error.message`. Sucesso de criar/editar/lifecycle emite toast padronizado (com ação "abrir detalhe" no toast de Work Item criado); desconexão WS com request pendente tira o modal de `creating…` com erro acionável e retry sempre gera novo `requestId`.
10. **(Opcional) Sync manual ↔ derivado** — sugerir "marcar como done" quando progress = N/N.
15. ~~**Persistência de filtros e tab no hash**~~ — **entregue (PF-18)**: filtros, ordenação e tab de `ProjectDetailPage` (`q`, `status`, `order`, `tab`) e `EpicDetailPage` (`q`, `status`, `type`, `repo`, `order`) persistem como query no hash (`#/projects/p1?status=done&q=auth`) via `lib/hashState.ts` — escrita por `history.replaceState` (sem poluir histórico; busca de texto com debounce de 250ms), leitura na montagem com validação (valor inválido cai no default sem crash) e memória por rota para o breadcrumb/voltar restaurar a lista como estava (`hashWithRestoredQuery`, usado no breadcrumb do `EpicDetailPage` e nos backs do `App`). `parseHash` ignora o sufixo de query (PF-11). Paginação fica em state local — único estado que se perde ao voltar (decisão registrada). Board/Runs fora do escopo (não-escopo declarado).
14. ~~**Visibilidade de arquivados no contexto**~~ — **entregue (PF-17)**: toggle "show archived" ao lado dos filtros no `ProjectDetailPage` (Epics) e no `EpicDetailPage` (Work Items), default off. Ligado, dispara `action:queryArchived` escopada (`{projectId, kind:'epic'}` / `{epicId, kind:'work_item'}`) e renderiza os arquivados atenuados (`--text-faint`, borda tracejada, `Tag` "archived", sem drill-down) com `Restore` inline via `LifecycleActions` (feedback padrão PF-07); a entidade restaurada volta à lista ativa via push e sai da seção de arquivados. Rota direta de epic arquivado mostra "Epic archived" com restore + voltar, em vez do "not found" genérico. Progresso derivado segue ignorando arquivados (listas ativas não os incluem).
13. ~~**Ações de execução na hierarquia**~~ — **entregue (PF-15)**: linha do Work Item no `EpicDetailPage` ganha ação à direita (com `stopPropagation`, sem disparar a navegação da linha): item elegível mostra `start` que emite `action:startFeature` e toast com ação "acompanhar run" → `/runs/:featureId`; item inelegível mostra `start` desabilitado com o motivo em `title` (dependência pendente, repo `unavailable`, `integrityIssue`); item com run ativa (`running`/`blocked`) mostra `view run` → detalhe da run (onde vivem pause/resume/abort) e a pill anima o spinner. Elegibilidade centralizada em `lib/startEligibility.ts`, compartilhada com o `BacklogItemDetail` (que passou a considerar `integrityIssue` também). Erros de start seguem o canal `ui:notice` existente (mensagem real do servidor).
12. ~~**Edição de Project no detalhe**~~ — **entregue (PF-16)**: `EditProjectModal` (`components/project/`) aberto por `editar Projeto` no header do `ProjectDetailPage`; nome obrigatório + descrição sobre `action:updateProject` com `expectedRevision`; conflito de revisão preserva o draft e oferece "reload current values"/"reapply draft" (reaplicar usa a revisão vinda no push); sucesso fecha + toast, header/breadcrumb refletem via push. O form do card do `ProjectsPage` permanece (mesma action, sem divergência). Bônus: `isRevisionConflictMessage` corrige a detecção de conflito (o texto real é "has revision N; expected M", não "changed") no `EpicEditor` e no card do `ProjectsPage`.
11. ~~**Adicionar repositório por path na UI**~~ — **entregue (PF-13)**: `RepositoriesSection` ganha "+ add a repository by path" (input de path absoluto) com fluxo em duas etapas espelhando o contrato do servidor: probe `action:linkRepo { path }` → `REPO_PATH_CONFIRMATION_REQUIRED` → painel de confirmação → `confirm: true` registra e vincula (o servidor resolve realpath/allowlist apenas na chamada confirmada). Recusas (`REPO_PATH_NOT_ALLOWED`, `REPO_ALREADY_LINKED`, …) aparecem íntegras em `role="alert"`; cancelar não envia nada. A seção agora também é montada no card Repositories do `ProjectDetailPage`, e projeto sem repo mostra CTA de adicionar em vez do aviso passivo.

---

## 7. Ordem sugerida de implementação

1. F-A: Rota + `EpicDetailPage` (lista de features, sem filtros) — destrava a navegação.
2. F-B: Refatorar `ProjectDetailPage` (lista de épicos em linhas + remover forms inline).
3. F-C: Modais de criação (Épico e Feature).
4. F-D: Filtros (épicos e features) + status "não iniciada".
5. F-E: Realocar Workflow Templates + polish (breadcrumb, toasts, erros).
