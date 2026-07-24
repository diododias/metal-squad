# Épico Visual Refactoring — `msq web` — Roadmap

> Transformar o brain-dump visual do backlog (ver `plan.md`) em unidades de
> implementação com aceite validável. O `plan.md` é a visão de negócio/design
> (8 temas A–H); este roadmap quebra cada tema em itens `VR-nn` dimensionados
> para uma run de IA, ancorados no código real de `src/web/client/`.
>
> **Princípio-guia** (do `plan.md`): _a tela é uma função do estado_. Botões,
> badges, cores e abas derivam do status da entidade — nunca de placeholder de
> texto ou botão sempre visível. Muita coisa já está no lugar (o app tem
> `StatusPill` com `blocked`/spinner, `LifecycleActions` dirigido por `allowed`
> vindo do servidor, `MarkdownView` com `react-markdown`, `startEligibility`
> compartilhado). Cada `VR-nn` diz explicitamente **o que já existe** e **o que
> falta**, para não reimplementar o que está pronto.
>
> Atualizado em 2026-07-24.

---

## Superfície & fontes de verdade

- **UI oficial**: `msq web` (`src/web/client/`). A TUI Ink (`src/ui/`) está
  aposentada (ver `repo-context.md`) — nenhum `VR-nn` a toca; se um item
  encostar nela, o padrão é remover, não evoluir.
- **Vocabulário do épico Projetos** (canônico): `Project → Epic → Work Item →
  Task`; `WorkItemType` = `feature | bug`. Os `VR-nn` usam esse vocabulário;
  `feature`/`featureId` aparecem só como compatibilidade legada já presente no
  código (`featureCatalog`, `action:startFeature`).
- **Contrato WS**: `src/web/types.ts` (client) e `src/web/schemas.ts`
  (validação). Nenhum `VR-nn` inventa action fora desse contrato sem declará-lo
  como dependência de backend explícita (ver M1).

---

## Fronteira front vs. backend

Diferente do épico _Projetos — Front_ (100% front), este épico é
**majoritariamente visual mas não 100% front**. Três frentes exigem backend e
estão isoladas no M1 para não bloquear o resto:

- **Ciclo de vida do Epic** (`VR-05`, `VR-06`): hoje `EpicStatus` é
  `todo | in_progress | done` **manual** (`core/backlog/schema.ts:277`,
  `EpicEditor`). `in_review`, transições automáticas e a ação **Aprovar** exigem
  schema + migração + action WS.
- **WASTE TOKENS no Abort** (`VR-03`): contabilização de tokens gastos numa run
  abortada é telemetria/persistência, não só badge.
- **Analytics e ordenação** (`VR-31`, `VR-32`): dashboards de consumo já são
  escopo do **épico Analytics** (`ANA-05/06/07/12`) — aqui ficam só o **grafo de
  dependências** e o **drag-and-drop de ordem**, com cross-reference a ANA.

Todo o restante (Temas B, C, D parcial, E, F, G) é front puro sobre
componentes existentes.

---

## Grafo de marcos

```text
M1 (Estados) ─┬─► M3 (IDs/idioma) ─► M4 (Layout) ─► M5 (Blocos WI) ─► M6 (Kanban/Run)
              └─► M2 (Save UX)                                         │
                                                        M7 (Sidebar) ◄─┘
                                                        M8 (Analytics/grafo)
```

- **Caminho crítico**: `M1 → M4 → M5 → M6`. Estados corretos destravam botões,
  badges e cards; o molde de detalhe (M4) precede a reorganização dos blocos
  (M5); os cards (M6) consomem estados (M1) e blocos (M5).
- **M2 (Save UX)** é paralelo e independente — pode entrar junto de M1 (ambos
  P0).
- **M3 (IDs/idioma/badges)** é barato e alimenta M4/M6 (badge feature/bug,
  Board `FAILED`); entra cedo.
- **M7/M8** fecham o épico (polish e visão de futuro).

---

## M1 — Máquina de estados e ações contextuais · Tema A · **P0**

O coração do redesign. Deriva botões/badges/cores do status da entidade.

- [VR-01 — Modelo de estado do Work Item e derivação da pill (`BLOCKED`)](features/VR-01-modelo-estado-work-item-blocked.md)
- [VR-02 — Ações contextuais do Work Item (Start/Resume/Delete/Abort/Cancel)](features/VR-02-acoes-contextuais-work-item.md)
- [VR-03 — Abort contabiliza WASTE TOKENS](features/VR-03-abort-waste-tokens.md)
- [VR-04 — Placeholders de texto → botão mutado com motivo](features/VR-04-placeholders-botao-mutado.md)
- [VR-05 — Ciclo de vida do Epic: schema, `in_review` e transições automáticas](features/VR-05-ciclo-vida-epic-schema-transicoes.md)
- [VR-06 — Ação "Aprovar" do Epic e Archive só após `done`](features/VR-06-aprovar-epic-archive-apos-done.md)
- [VR-07 — Work Item: `Failed → TODO/Done` e `Done → Clonar`](features/VR-07-failed-todo-done-clonar.md)

**✅ Validação M1:** um Work Item nunca mostra `Start` fora de `TODO`;
`BLOCKED` tem badge próprio e oferece `Resume`+`Abort`; abortar uma run com
tokens gastos marca WASTE; um Epic vira `in_progress` ao iniciar o 1º item e
`in_review` ao concluir todos, com **Aprovar** levando a `done` e Archive só
depois; nenhum placeholder de texto no lugar de botão.

---

## M2 — UX de salvamento e edição · Tema D · **P0**

Para de perder trabalho silenciosamente. Confiança imediata.

- [VR-08 — Padrão de save global por página (dirty state + botão único)](features/VR-08-save-global-dirty-state.md)
- [VR-09 — Guarda de saída com modal "Descartar alterações?"](features/VR-09-guarda-saida-descartar-alteracoes.md)
- [VR-10 — Settings › Defaults › Skills: fim da perda silenciosa](features/VR-10-settings-skills-salvar.md)
- [VR-11 — Edição de Epic passa a salvar sob o padrão global](features/VR-11-editar-epic-salvar.md)

**✅ Validação M2:** alterar qualquer campo marca a página _dirty_ e revela um
único botão Salvar; tentar sair com pendências abre o modal Descartar/Cancelar;
editar skills em Settings e navegar não perde a alteração; editar um Epic salva.

---

## M3 — Nomenclatura, IDs e idioma · Tema C · **P1**

Padronização barata e de alto impacto na percepção de produto acabado.

- [VR-12 — Prefixos de ID `P/E/B/R` (+ `F` atual) consistentes](features/VR-12-prefixos-id-p-e-b-r.md)
- [VR-13 — Resíduos PT→EN: Board `FALHA / CANCELED` → `FAILED`](features/VR-13-residuos-pt-en-board-failed.md)
- [VR-14 — Badge `feature/bug` em todas as superfícies; remover "Change to XXX"](features/VR-14-badge-feature-bug-remover-change-to.md)

**✅ Validação M3:** cada entidade exibe seu prefixo de id; o Board não tem
mais texto em PT; o badge de tipo aparece na lista, no card e na Run Detail;
não há botão de troca de tipo pós-criação.

---

## M4 — Consistência de layout entre páginas de detalhe · Tema B · **P1**

Projects, Epics e Work Item Details seguem o mesmo molde.

- [VR-15 — Molde único de página de detalhe (título+ações / search / descrição)](features/VR-15-molde-unico-pagina-detalhe.md)
- [VR-16 — Epic exibe descrição (markdown) e some o botão "novo" redundante](features/VR-16-epic-descricao-remover-botao-redundante.md)
- [VR-17 — Breadcrumbs completos `Projeto › Epic › Work Item` na Run Detail](features/VR-17-breadcrumbs-completos-run-detail.md)

**✅ Validação M4:** as três páginas de detalhe posicionam título, ações,
search e descrição no mesmo lugar; Epic mostra descrição; a Run Detail tem a
trilha completa; botão de criação só no topo.

---

## M5 — Reorganização dos blocos do Work Item · Tema E · **P1**

Depende do molde de M4. Blocos com propósito claro.

- [VR-18 — Bloco Requirements (Spec + Context + Dependências editáveis)](features/VR-18-bloco-requirements.md)
- [VR-19 — Bloco Tool/Adapter (desktop lado-a-lado, mobile empilhado)](features/VR-19-bloco-tool-adapter.md)
- [VR-20 — Bloco Behaviour + Approvals Channel migra para o Projeto](features/VR-20-bloco-behaviour-approvals-projeto.md)

**✅ Validação M5:** a página do Work Item tem três blocos nomeados;
dependências se editam dentro de Requirements; Tool/Adapter fica lado a lado no
desktop; Auto Advance só aparece com `mode = staged`; Approvals Channel sai do
Work Item e vira config do Projeto.

---

## M6 — Componentes de acompanhamento (Kanban + Run Detail) · Tema F · **P1**

As telas mais olhadas no dia a dia. Onde mora a percepção de "o app está vivo".

- [VR-21 — KanbanCard: timelapse ao vivo (segundo a segundo)](features/VR-21-kanbancard-timelapse-ao-vivo.md)
- [VR-22 — KanbanCard: largura mínima, rolagem lateral e spinner real](features/VR-22-kanbancard-min-width-spinner.md)
- [VR-23 — KanbanCard: `Start`/`Resume` no card, dep-ok e auto adv/start visíveis](features/VR-23-kanbancard-start-resume-dep-ok.md)
- [VR-24 — Run Detail: 1ª aba Feature Spec e consolidação da aba Workflow](features/VR-24-run-detail-abas-consolidar-workflow.md)
- [VR-25 — Run Detail: janela de contexto sem `%` (corrige os 700%)](features/VR-25-run-detail-contexto-sem-percent.md)
- [VR-26 — Run Detail: hover no Live Output e badge feature/bug](features/VR-26-run-detail-hover-live-output-badge.md)
- [VR-27 — Spec Preview: fundo menos agressivo](features/VR-27-spec-preview-fundo.md)

**✅ Validação M6:** o card de um item running conta o tempo ao vivo com
spinner animado; cards não se espremem (rolagem lateral); dá para iniciar da
`TODO` e retomar de `BLOCKED` no próprio card; a Run Detail abre com a Spec,
sem aba Workflow redundante; a janela de contexto mostra total consumido sem
porcentagem quebrada; hover destaca a linha no Live Output.

---

## M7 — Sidebar e navegação · Tema G · **P2**

Polimento de navegação.

- [VR-28 — Ordem definida da sidebar](features/VR-28-sidebar-ordem.md)
- [VR-29 — Minimização com ícones (fallback 1ª letra já existe)](features/VR-29-sidebar-minimizacao-icones.md)
- [VR-30 — Markdown em descrições de Project/Epic e clareza Auto Advance/Start](features/VR-30-markdown-descricoes-clareza-auto.md)

**✅ Validação M7:** a sidebar segue `Project → Board → Run → Gates → Archived
→ Analytics → Settings`; colapsada mostra ícones; descrições de Project/Epic
renderizam markdown; rótulos/tooltips deixam claro o papel de Auto Advance vs
Auto Start.

---

## M8 — Analytics e grafo de dependências · Tema H · **P3 (visão de futuro)**

Depende da base pronta. Alto valor, mas depois.

- [VR-31 — Grafo de dependências do Epic (ordem de implementação/revisão)](features/VR-31-grafo-dependencias-epic.md)
- [VR-32 — Ordenação do backlog por drag-and-drop](features/VR-32-drag-and-drop-ordem-execucao.md)

> **Dashboards de consumo (todas as features, separar sessões/tokens, token por
> Tool/Modelo/Effort) são escopo do épico Analytics** (`ANA-05`, `ANA-06`,
> `ANA-07`, `ANA-12`), não deste. O Tema H aqui cobre só o que a Analytics não
> entrega: o grafo de dependências e o reordenamento visual.

**✅ Validação M8:** o Epic mostra um grafo navegável das dependências entre
Work Items com a ordem de implementação/revisão; arrastar reordena a execução e
persiste.

---

## Checklist transversal (toda feature)

- Branch a partir de `develop`; sem worktree; sem commit direto em `develop`;
  skill `/dev-flow` (ver `.claude/rules/git-workflow.md`).
- `rtk npm run build && rtk npm test && rtk npm run typecheck` (+ `lint` em TS
  de `src/`). Suite focada: `rtk npx vitest run tests/web/`.
- Reusar primitivos de `src/web/client/components/core/` e o padrão de
  `PageHeader` (slots `breadcrumb`/`actions`/`filters`/`description`).
- `VR-nn` front puro: **nenhuma action WS nova**; payloads e `requestId` seguem
  `src/web/types.ts`. Os `VR-nn` de backend (`VR-05/06`, parte de `VR-03`)
  declaram schema+migração+action e ajustam schema → loader → repo → prompt →
  UI juntos (ver `.claude/rules/architecture.md`).
- Tocou comportamento observável → atualizar `docs/ux/*` no repo e o doc de
  feature correspondente.

---

## Não-escopo declarado (decisões, não omissões)

- **Analytics dashboards**: pertencem ao épico Analytics (`ANA-*`). Aqui só
  grafo e drag-and-drop.
- **Reescrita da TUI**: aposentada; nenhum `VR-nn` a evolui.
- **P0 técnicos não-visuais** (retomar sessão após timeout, duplicação
  web+telegram, pausa que não para o adapter, `git fetch` de branch inexistente,
  separação prod/develop, empacotamento): registrados no `plan.md §6`, fora
  deste épico visual — exceto onde o estado visual depende deles (`VR-01`
  referencia a semântica de `BLOCKED` produzida por esses fluxos).
- **Mudança de tipo pós-criação**: `action:changeWorkItemType` existe no
  backend; `VR-14` **remove o gatilho de UI** (tipo é escolhido na criação),
  não a action.

---

## Resumo de contagem

- **8 marcos**, **32 features** (`VR-01`–`VR-32`), cobrindo integralmente a
  matriz item→tema do `plan.md §5`.
- **Front puro**: 28 itens. **Requer backend**: 4 (`VR-03` parcial, `VR-05`,
  `VR-06`; `VR-31/32` persistência de ordem).
- Caminho crítico: `M1 → M4 → M5 → M6`, com `M2` paralelo.
