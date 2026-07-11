# Feature Specification: Remove OVERRIDE PONTUAL

**Feature Branch**: `007-remove-override-pontual`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "F37 — Remove OVERRIDE PONTUAL"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Editar e persistir configuracao de feature (Priority: P1)

Um usuario abre a tela de detalhe de uma feature, edita parametros como tool, model, effort, maxTokens, skills, workflow, retry ou dependsOn, e clica "Save Config". Os valores sao persistidos no banco e, na proxima execucao da feature, o sistema le a configuracao persistida automaticamente.

**Why this priority**: Este e o fluxo principal apos a remocao do override pontual. E a unica forma de customizar parametros de feature, e precisa funcionar corretamente para que o usuario nao perca a capacidade de configuracao.

**Independent Test**: Pode ser testado abrindo a feature detail, editando qualquer parametro, clicando "Save Config", reiniciando a pagina, e verificando que os valores editados permanecem salvos. Iniciar a feature deve usar esses valores persistidos.

**Acceptance Scenarios**:

1. **Given** uma feature com configuracao padrao, **When** o usuario edita o parametro "tool" e clica "Save Config", **Then** o novo valor de "tool" e persistido e exibido ao recarregar a pagina.
2. **Given** uma feature com configuracao ja salva, **When** o usuario inicia a feature, **Then** o sistema usa a configuracao persistida do banco sem solicitar override.
3. **Given** uma feature com configuracao salva, **When** o usuario edita multiplos parametros (tool, model, effort, maxTokens) e clica "Save Config", **Then** todos os valores sao persistidos corretamente.

---

### User Story 2 - Executar feature sem opcao de override (Priority: P2)

Um usuario abre a tela de detalhe de uma feature e nao ve mais a secao "Override pontual". A interface apresenta apenas os campos de edicao de parametros e o botao "Save Config", eliminando a ambiguidade entre os dois caminhos anteriores.

**Why this priority**: A remocao da UI de override e o principal entregavel desta feature. Elimina a confusao UX entre override temporario e save config persistente.

**Independent Test**: Pode ser testado abrindo a feature detail e verificando que nenhuma secao de override e renderizada, nenhum campo de override esta presente, e o unico caminho para customizar parametros e via "Save Config".

**Acceptance Scenarios**:

1. **Given** a feature detail aberta, **When** o usuario observa a interface, **Then** nao ha secao "Override pontual", nao ha campos de override tool/model/effort, e nao ha botoes ou toggles relacionados a override.
2. **Given** a feature detail aberta, **When** o usuario deseja customizar parametros, **Then** o unico caminho disponivel e editar os campos e clicar "Save Config".

---

### User Story 3 - Executar feature via CLI sem flags de override (Priority: P2)

Um usuario executa `msq run` para iniciar uma feature via CLI. As flags `--tool`, `--model` e `--effort` nao estao mais disponiveis. O comando `msq run --help` nao lista essas opcoes. A execucao usa a configuracao persistida no banco.

**Why this priority**: A remocao das flags CLI completa a limpeza tecnica, garantindo que nao haja caminho residual para override pontual.

**Independent Test**: Pode ser testado executando `msq run --help` e verificando que as flags `--tool`, `--model`, `--effort` nao aparecem. Executar `msq run <feature>` deve usar a configuracao persistida.

**Acceptance Scenarios**:

1. **Given** o CLI instalado, **When** o usuario executa `msq run --help`, **Then** as flags `--tool`, `--model`, `--effort` nao estao listadas.
2. **Given** uma feature com configuracao persistida, **When** o usuario executa `msq run <feature>`, **Then** o sistema usa a configuracao do banco sem aceitar overrides via CLI.

---

### Edge Cases

- O que acontece quando uma feature nunca teve configuracao salva e e executada? O sistema deve usar valores padrao definidos no codigo.
- O que acontece se o banco de configuracoes estiver corrompido ou inacessivel? O sistema deve exibir mensagem de erro clara e nao iniciar a feature com valores indeterminados.
- O que acontece com features que foram executadas anteriormente com override pontual? A configuracao persistida no banco (se houver) deve ser usada; se nao houver, valores padrao se aplicam.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST nao renderizar nenhuma secao, campo, botao ou toggle relacionado a "Override pontual" na interface de detalhe de feature.
- **FR-002**: O sistema MUST nao aceitar as opcoes `--tool`, `--model`, `--effort` como argumentos do comando de execucao via linha de comando.
- **FR-003**: O sistema MUST nao processar nem transmitir overrides pontuais na comunicacao entre frontend e servidor.
- **FR-004**: O sistema MUST nao aplicar configuracoes temporarias em memoria que bypassam a configuracao persistida.
- **FR-005**: O sistema MUST nao exibir estilos visuais associados a campos de override pontual.
- **FR-006**: O sistema MUST nao enviar overrides do frontend para o servidor ao iniciar uma feature.
- **FR-007**: O sistema MUST remover toda logica de mutacao em memoria que permita sobrescrever configuracoes persistidas durante a execucao.
- **FR-008**: O sistema MUST garantir que a edicao e persistencia de parametros via "Save Config" continue funcionando corretamente apos a remocao.
- **FR-009**: O sistema MUST garantir que a execucao de features leia configuracao persistida do banco (F35) sem possibilidade de override.
- **FR-010**: A documentacao (F34, F36, README) MUST ser atualizada para refletir a remocao do override pontual.

### Key Entities

- **Feature Configuration**: Conjunto de parametros persistidos no banco para uma feature (tool, model, effort, maxTokens, skills, workflow, retry, dependsOn). Apos esta feature, e a unica fonte de customizacao de parametros.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero referencias a "override pontual", "OVERRIDE PONTUAL", ou "override" permanecem no codigo-fonte e na documentacao apos a implementacao.
- **SC-002**: `msq run --help` nao lista `--tool`, `--model`, `--effort` como opcoes disponiveis.
- **SC-003**: 100% dos testes existentes passam sem modificacoes que dependam de override pontual.
- **SC-004**: Typecheck e build passam sem erros apos a remocao.
- **SC-005**: Usuarios conseguem editar e persistir parametros de feature via "Save Config" em menos de 30 segundos.
- **SC-006**: A interface de feature detail apresenta zero elementos visuais relacionados a override pontual.

## Assumptions

- A persistencia de configuracao via F36 (web feature/task config persistence) ja esta implementada e funcionando corretamente.
- O banco de dados (F35) ja armazena configuracoes de feature e esta acessivel tanto pelo web server quanto pelo CLI.
- Nenhum usuario depende criticamente do fluxo de override pontual que nao possa ser substituido por "Save Config".
- A remocao e puramente tecnica e nao introduz nova funcionalidade, schema, migration ou API.
- Valores padrao de parametros ja estao definidos no codigo para o caso de features sem configuracao persistida.
