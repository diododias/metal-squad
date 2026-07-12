---

description: "Task list for Live Output — Hierarquia Visual e Cores Mutadas"

---

# Tasks: Live Output — Hierarquia Visual e Cores Mutadas

**Input**: Design documents from `/specs/010-live-output-visual-hierarchy/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Nao solicitados na spec/plan — validacao e visual/manual via `quickstart.md` (`tests/web/` nao cobre renderizacao de `src/web/static/`). Nenhuma task de teste automatizado foi gerada.

**Organization**: Tasks agrupadas por user story para permitir implementacao e validacao independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependencia)
- **[Story]**: A qual user story a task pertence (US1, US2, US3)
- Caminhos de arquivo exatos incluidos em cada descricao

## Path Conventions

Aplicacao web unica servida por `src/web/` (sem build step). Todo o escopo fica em `src/web/static/styles.css` e `src/web/static/components/RunDetail.js` (ver `plan.md` Project Structure).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Nao ha inicializacao de projeto/dependencias — feature e puramente CSS/markup em codigo ja existente.

- [ ] T001 Build atual do `msq` para servir de baseline visual "antes": rodar `rtk npm run build` e abrir `rtk node dist/index.js ui`, localizar uma run real (ou fixture local) com entries `tool`, `heartbeat` e `stderr` intercaladas, e anotar/capturar screenshot do estado atual do painel Live Output em `src/web/static/components/RunDetail.js` para comparacao pos-mudanca (ver `quickstart.md`)

**Checkpoint**: Baseline "antes" registrado para validar SC-001..SC-004 apos as mudancas.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Nao ha infraestrutura compartilhada bloqueante nesta feature (sem schema, auth, routing novos). O unico pre-requisito e o baseline da Phase 1.

**Checkpoint**: Nenhuma dependencia adicional — as user stories podem comecar assim que T001 estiver feito.

---

## Phase 3: User Story 1 - Acompanhar o raciocinio do agente sem distracao visual (Priority: P1) 🎯 MVP

**Goal**: A narrativa do agente passa a ser o elemento visualmente mais proeminente do painel Live Output; entries `tool` deixam de ter tratamento de "card" (borda/background/padding/largura de bloco) e nenhuma delas ocupa a largura total do container.

**Independent Test**: Abrir o detalhe de uma run real com narrativa e tool calls intercalados e verificar visualmente que o texto de narrativa se destaca mais do que os blocos de tool call, e que nenhuma entry `tool` esticar borda-a-borda (curta ou longa).

### Implementation for User Story 1

- [X] T002 [US1] Remover o tratamento de "card" da regra `.output-entry.tool` em `src/web/static/styles.css:598-604` (remover `border`, `border-radius`, `padding`, `background: var(--panel)`, `margin-bottom: 6px` divergente) e substituir por um layout compacto que nao herde `white-space: pre-wrap` de largura total — usar `display: inline-block` (ou `width: fit-content`) para que a entry nunca estique borda-a-borda, independente do tamanho do texto (FR-001, edge cases de texto muito longo e muito curto)
- [X] T003 [US1] Aplicar cor mutada `color: var(--muted)` na regra `.output-entry.tool` atualizada em `src/web/static/styles.css`, alinhada ao contraste ja usado por `.output-entry.heartbeat` (`src/web/static/styles.css:606-609`), sem alterar as regras `.output-entry.heartbeat` (FR-002, FR-005, SC-003)
- [X] T004 [US1] Confirmar em `renderOutputEntry` (`src/web/static/components/RunDetail.js:139-144`) que `truncateText(entry.line, maxWidth)` continua sendo usado para a entry `tool`, garantindo que textos longos (ex.: comando de shell extenso) permanecam truncados de forma compacta e nao voltem a ocupar a largura total do container mesmo com o novo `display` (edge case de texto longo, FR-001)
- [ ] T005 [US1] Validar manualmente contra `quickstart.md` passos 2-3 e 5 (SC-001, SC-002): abrir o mesmo detalhe de run usado no baseline (T001), comparar visualmente narrativa vs. tool, testar texto de tool muito longo e muito curto, e repetir em largura de janela estreita

**Checkpoint**: User Story 1 completa e testavel de forma independente — narrativa e o elemento mais proeminente, nenhuma entry `tool` ocupa largura total.

---

## Phase 4: User Story 2 - Identificar rapidamente uma chamada de ferramenta sem ela "gritar" (Priority: P2)

**Goal**: Mesmo com o novo tratamento discreto, a entry `tool` continua claramente identificavel como tal por um indicador/prefixo curto, preservando a distincao semantica entre os quatro tipos de entry.

**Independent Test**: Visualizar um trecho do Live Output com narrativa, tool, heartbeat e stderr juntos e confirmar que os quatro tipos continuam visualmente distinguiveis, com a entry `tool` identificavel por indicador/prefixo mesmo com cor apagada.

### Implementation for User Story 2

- [X] T006 [US2] Adicionar um prefixo textual curto (ex.: `TOOL>`, seguindo o mesmo padrao ja usado por `ERR>` em `src/web/static/components/RunDetail.js:157`) na renderizacao da entry `tool` em `renderOutputEntry` (`src/web/static/components/RunDetail.js:139-144`), ajustando `truncateText(entry.line, maxWidth)` para `truncateText(entry.line, maxWidth - N)` (mesmo padrao usado na entry `stderr` em `RunDetail.js:157`) para o prefixo nao estourar o `maxWidth` (FR-006, User Story 2)
- [ ] T007 [US2] Validar manualmente contra `quickstart.md` passo 4: com narrativa, tool, heartbeat e stderr juntos no painel, confirmar que os quatro tipos permanecem distinguiveis entre si e que a entry `tool` e reconhecivel pelo prefixo mesmo apagada (depende de T002-T003, T006)

**Checkpoint**: User Stories 1 e 2 funcionam juntas — tratamento discreto sem perda de distincao semantica.

---

## Phase 5: User Story 3 - Continuar identificando erros imediatamente (Priority: P1)

**Goal**: A entry `stderr` mantem exatamente o mesmo destaque visual de alerta (cor `--danger`, prefixo `ERR>`) de antes da mudanca, sem nenhuma regressao.

**Independent Test**: Verificar que uma linha `stderr` mantem a mesma cor de alerta usada hoje, independentemente das mudancas nas entries de `tool`.

### Implementation for User Story 3

- [X] T008 [US3] Confirmar que a regra `.output-entry.stderr` em `src/web/static/styles.css:611-613` (`color: var(--danger)`) e o prefixo `ERR>` em `renderOutputEntry` (`src/web/static/components/RunDetail.js:153-158`) permanecem inalterados apos T002-T003 e T006 — nenhuma edicao deve tocar essas linhas; se houver colisao acidental de estilo herdado de `.output-entry` (`src/web/static/styles.css:594-596`), corrigir para preservar o contraste de alerta (FR-004)
- [ ] T009 [US3] Validar manualmente contra `quickstart.md` passo 3/SC-004: comparar a entry `stderr` antes (baseline T001) e depois das mudancas, confirmando que o nivel de destaque visual de alerta e identico (depende de T002-T003, T006, T008)

**Checkpoint**: Todas as user stories funcionam de forma independente e conjunta — narrativa proeminente, tool discreto mas identificavel, stderr sem regressao.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validacao final de escopo e dos criterios de sucesso completos.

- [ ] T010 Rodar a suite de validacao completa de `quickstart.md` (passos 1-6) de ponta a ponta, incluindo o passo 6 (confirmar que streaming, auto-scroll/pause com Ctrl+S e conteudo textual das linhas permanecem inalterados — FR-007) e a checagem "Fora de escopo" de que a TUI (`src/ui/`) nao foi tocada (FR-008)
- [X] T011 [P] Rodar `rtk npm run lint` e `rtk npm run typecheck` para confirmar que as edicoes em `src/web/static/components/RunDetail.js` nao introduziram problemas (arquivo JS servido sem build, mas cobrido por lint/typecheck do repo conforme `.claude/rules/testing.md`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependencias — apenas registrar o baseline visual "antes" (T001)
- **Foundational (Phase 2)**: Vazia nesta feature — nenhuma infraestrutura bloqueante alem do baseline
- **User Story 1 (Phase 3)**: Depende de T001 — pode comecar imediatamente apos o baseline
- **User Story 2 (Phase 4)**: Depende de T001; T006 e independente de T002-T003 em termos de arquivo (`RunDetail.js` vs `styles.css`), mas a validacao T007 depende de US1 estar completa
- **User Story 3 (Phase 5)**: Depende de T001; T008 e uma verificacao de nao-regressao que so faz sentido apos T002-T003 e T006 existirem
- **Polish (Phase 6)**: Depende de todas as user stories completas

### User Story Dependencies

- **User Story 1 (P1)**: Pode comecar apos T001 — sem dependencia de outras stories
- **User Story 2 (P2)**: Pode comecar apos T001; T006 toca um arquivo diferente de T002-T003 (US1) e pode ser implementada em paralelo, mas sua validacao (T007) precisa do resultado combinado
- **User Story 3 (P1)**: E primariamente uma verificacao de nao-regressao; sua validacao (T009) so e significativa depois que US1 e US2 estiverem implementadas

### Within Each User Story

- Implementacao antes de validacao manual
- US1 (CSS) e US2 (markup/prefixo) tocam arquivos diferentes e podem avancar em paralelo; a validacao conjunta (T007) espera ambas
- US3 e checagem de nao-regressao — roda por ultimo para confirmar que nada quebrou

### Parallel Opportunities

- T002/T003 (CSS, `styles.css`) e T006 (markup, `RunDetail.js`) podem ser feitas em paralelo por tocarem arquivos diferentes
- T011 (lint/typecheck) pode rodar em paralelo com validacoes manuais (T005, T007, T009, T010)

---

## Parallel Example: User Story 1 + User Story 2

```bash
# T002/T003 (styles.css) e T006 (RunDetail.js) tocam arquivos diferentes:
Task: "Remover card e aplicar cor mutada em .output-entry.tool em src/web/static/styles.css:598-604"
Task: "Adicionar prefixo TOOL> em renderOutputEntry em src/web/static/components/RunDetail.js:139-144"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (T001 — baseline)
2. Phase 2: Foundational — vazia, nada a fazer
3. Completar Phase 3: User Story 1 (T002-T005)
4. **PARAR e VALIDAR**: SC-001/SC-002 confirmados visualmente
5. Esse ja e o nucleo do valor da feature (narrativa proeminente, tool sem card)

### Incremental Delivery

1. Setup (T001) → baseline pronto
2. User Story 1 (T002-T005) → validar independentemente → MVP entregue
3. User Story 2 (T006-T007) → validar independentemente → distincao semantica preservada
4. User Story 3 (T008-T009) → validar independentemente → confirma ausencia de regressao em stderr
5. Polish (T010-T011) → validacao final de ponta a ponta

---

## Notes

- [P] tasks = arquivos diferentes, sem dependencia
- [Story] mapeia a task para a user story correspondente
- Nao ha suite automatizada de renderizacao para esta feature — validacao e manual via `quickstart.md`
- Nenhuma mudanca em `src/db/`, `src/core/`, backend/routing ou TUI (`src/ui/`) e esperada ou permitida (FR-007, FR-008)
- Commitar apos cada task ou grupo logico
- Parar em cada checkpoint para validar a story independentemente
