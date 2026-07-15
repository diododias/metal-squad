# Tasks: Remover tab "Features & Prompts" do Config

**Input**: Design documents from `/specs/027-remover-tab-features-prompts/`

**Tests**: Não são criados testes novos de `ConfigPage.tsx`: a remoção é localizada e a cobertura existente de `FeatureConfigDetail` em `tests/web/featureConfigDetail.test.tsx`, combinada com busca textual, typecheck, lint, build e inspeção manual, cobre os critérios da especificação.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar o limite da mudança antes da implementação.

- [X] T001 [P] Confirmar a fronteira da remoção nos pontos do dashboard em `src/web/client/pages/ConfigPage.tsx`, `src/web/client/pages/BacklogItemDetail.tsx` e `src/web/client/pages/RunDetailPage.tsx`
- [X] T002 [P] Confirmar que não há contrato, persistência ou migração a alterar nos artefatos `specs/027-remover-tab-features-prompts/plan.md`, `specs/027-remover-tab-features-prompts/data-model.md` e `specs/027-remover-tab-features-prompts/research.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Garantir que a edição compartilhada pelo card permaneça disponível para a user story.

- [X] T003 Verificar a API de edição compartilhada e seus consumidores em `src/web/client/components/FeatureConfigDetail.tsx`, `src/web/client/pages/BacklogItemDetail.tsx` e `src/web/client/pages/RunDetailPage.tsx`, sem alterar esses arquivos

**Checkpoint**: A fundação está pronta quando o fluxo `FeatureConfigDetail` permanece delimitado ao card de detalhe e `ConfigPage.tsx` é o único arquivo de produção a modificar.

---

## Phase 3: User Story 1 - Config sem tab de features (Priority: P1) 🎯 MVP

**Goal**: Remover a sub-tab e toda a lógica local de features da ConfigPage, mantendo a edição pelo card de detalhe.

**Independent Test**: Abrir Config e confirmar as sub-tabs Runtime, Defaults, Skills, Notifications e Budget, sem conteúdo ou header relacionado a Features & Prompts; depois editar uma feature pelo card de detalhe.

### Implementation for User Story 1

- [X] T004 [US1] Remover a entrada `features` de `SUB_TABS`, a função `FeaturesPromptsTab`, o `case 'features'` e o import de `FeatureConfigDetail` em `src/web/client/pages/ConfigPage.tsx`
- [X] T005 [US1] Ajustar o `breadcrumb` do `PageHeader` em `src/web/client/pages/ConfigPage.tsx` para remover a ressalva `read-only except Features & Prompts`, preservando as demais sub-tabs
- [X] T006 [US1] Confirmar que a edição de feature continua sendo renderizada pelos cards em `src/web/client/pages/BacklogItemDetail.tsx` e `src/web/client/pages/RunDetailPage.tsx`, sem remover ou alterar `FeatureConfigDetail`

**Checkpoint**: A User Story 1 está completa quando Config não possui mais a tab removida nem referências locais a ela, e os cards de detalhe continuam oferecendo edição.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Validar ausência de referências órfãs, regressões e os gates do projeto.

- [X] T007 [P] Verificar que não existem referências a `Features & Prompts` ou `FeaturesPromptsTab` em `src/` e `tests/` usando a busca definida em `specs/027-remover-tab-features-prompts/quickstart.md`
- [X] T008 [P] Executar a cobertura existente do fluxo de edição em `tests/web/featureConfigDetail.test.tsx` com `rtk npm test -- tests/web/featureConfigDetail.test.tsx`
- [X] T009 Executar os gates de qualidade definidos em `package.json`: `rtk npm run build`, `rtk npm run typecheck` e `rtk npm run lint`
- [X] T010 Executar a suíte completa definida em `package.json` com `rtk npm test`
- [X] T011 Validar manualmente o dashboard conforme `specs/027-remover-tab-features-prompts/quickstart.md`: iniciar `msq web`, verificar a lista de sub-tabs e o header, e editar uma feature pelo card de detalhe

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Não depende de outras fases; T001 e T002 podem ser executadas em paralelo.
- **Foundational (Phase 2)**: Depende de T001 e T002; T003 bloqueia a implementação da história.
- **User Story 1 (Phase 3)**: Depende de T003; T004 e T005 alteram o mesmo arquivo e devem ser executadas sequencialmente, seguidas de T006.
- **Polish (Phase 4)**: Depende da conclusão de T004–T006; T007 e T008 podem ser executadas em paralelo, depois T009–T011.

### User Story Dependencies

- **User Story 1 (P1)**: Não depende de outra user story; depende apenas da fundação para preservar o fluxo compartilhado de edição.

### Parallel Opportunities

- T001 e T002 podem começar simultaneamente.
- T007 e T008 podem rodar simultaneamente após a implementação.
- Não há paralelismo de implementação dentro de US1 porque todas as mudanças de produção estão concentradas em `src/web/client/pages/ConfigPage.tsx`.

## Parallel Example: User Story 1

```text
# Após T004–T006:
Task T007: buscar referências órfãs em src/ e tests/
Task T008: executar tests/web/featureConfigDetail.test.tsx
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Concluir Setup e Foundational.
2. Executar T004–T006 para remover a tab e preservar a edição pelo card.
3. Executar T007–T011 e validar a User Story 1 de forma independente.

### Incremental Delivery

1. A única entrega funcional é a User Story 1, por ser o único objetivo P1 da especificação.
2. O incremento é demonstrável após a remoção em `ConfigPage.tsx` e a validação automatizada/manual.

## Notes

- Todas as tarefas seguem o formato de checklist com checkbox, ID sequencial e caminho de arquivo.
- Tarefas de teste novo foram omitidas porque a especificação e o plano registram que a cobertura existente é suficiente para esta remoção de UI.
