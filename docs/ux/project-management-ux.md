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
            └─ /backlog/:featureId             (Detalhe da Feature — já existe, reaproveitar)
```

Breadcrumb sempre visível: `Projects › {Projeto} › {Épico}`.

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

1. **Rota de detalhe do Épico** — `routes.ts` não tem `/projects/:id/epics/:epicId`; criar rota + página `EpicDetailPage`.
2. **Lista de Épicos com filtros** — refazer corpo do `ProjectDetailPage`: linhas clicáveis, filtro por status (manual + derivado), busca, ordenação.
3. **Modal de criação de Épico** — extrair form atual para modal; hoje é inline.
4. **Modal de criação de Feature** — extrair form + preview de template para modal com épico pré-selecionado.
5. **Lista de Features com filtros** — filtro por status de run, tipo e repo não existe em lugar nenhum no contexto do épico (só no Board, escopo diferente).
6. **Status "não iniciada" como pill própria** — hoje feature sem run mostra `aborted` reaproveitado (`status={run?.status ?? 'aborted'}`); criar estado visual correto.
7. **Realocar Workflow Templates** — tirar do fluxo de gestão; mover para settings do projeto.
8. **Breadcrumb de 2 níveis** — `PageHeader` aceita um nó só; suportar `Projects › Projeto` no detalhe do épico.
9. **Consistência de erro na criação** — "Could not save epic." atual não diz o motivo; propagar mensagem real do servidor no modal.
10. **(Opcional) Sync manual ↔ derivado** — sugerir "marcar como done" quando progress = N/N.

---

## 7. Ordem sugerida de implementação

1. F-A: Rota + `EpicDetailPage` (lista de features, sem filtros) — destrava a navegação.
2. F-B: Refatorar `ProjectDetailPage` (lista de épicos em linhas + remover forms inline).
3. F-C: Modais de criação (Épico e Feature).
4. F-D: Filtros (épicos e features) + status "não iniciada".
5. F-E: Realocar Workflow Templates + polish (breadcrumb, toasts, erros).
