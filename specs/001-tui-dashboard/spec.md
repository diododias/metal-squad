# Feature Specification: TUI Interativa — Painel de Runs, Tokens e Gates

**Feature Branch**: `001-tui-dashboard`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "o proximo TODO" — App.tsx placeholder com "TODO: painel de runs, tokens e gates"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Monitor Pipeline em Tempo Real (Priority: P1)

O desenvolvedor executa `msq ui` enquanto um `msq run` está em andamento e vê na tela
quais features estão rodando, quais já terminaram, quais falharam e quanto tempo cada
uma levou — tudo atualizado a cada poucos segundos sem necessidade de reabrir o comando.

**Why this priority**: É o núcleo do painel — sem esta visão o TUI não entrega valor.
Um pipeline longo pode ter dezenas de features; monitorar via logs é impraticável.

**Independent Test**: Pode ser testado sozinho iniciando `msq run` em paralelo e
verificando que o painel exibe as features e atualiza os status conforme elas progridem.

**Acceptance Scenarios**:

1. **Given** um backlog com 3 features (uma rodando, uma concluída, uma pendente),
   **When** o usuário executa `msq ui`,
   **Then** o painel exibe as 3 features com status visual distinto (ícone/cor) e a
   feature em execução mostra o tempo decorrido.

2. **Given** o painel aberto,
   **When** uma feature passa de `running` para `done`,
   **Then** o painel reflete a mudança sem o usuário pressionar nada, em no máximo 3 segundos.

3. **Given** o painel aberto,
   **When** uma feature termina com status `failed`,
   **Then** o status é destacado visualmente (cor diferente) e a feature permanece visível.

---

### User Story 2 — Visualizar Uso de Tokens por Feature (Priority: P2)

O desenvolvedor vê no painel, ao lado de cada feature concluída, quantos tokens foram
consumidos naquele run — separados por entrada e saída quando disponível — para monitorar
custo e identificar features que consomem tokens anormalmente.

**Why this priority**: Token cost é uma preocupação central em pipelines de IA;
a tabela `token_usage` já existe no DB mas não tem interface visível.

**Independent Test**: Pode ser testado com runs já gravados no banco; basta abrir
`msq ui` após um `msq run` concluído e verificar se os tokens aparecem para cada feature.

**Acceptance Scenarios**:

1. **Given** um run completo gravado no DB com token_usage,
   **When** o usuário abre `msq ui`,
   **Then** cada feature exibe o total de tokens consumidos (input + output ou total).

2. **Given** uma feature que ainda não terminou (status `running`),
   **When** ela é exibida no painel,
   **Then** o campo de tokens mostra `—` ou está ausente (sem dados parciais enganosos).

3. **Given** múltiplos runs históricos,
   **When** o painel é aberto,
   **Then** é exibido apenas o run mais recente de cada repo por padrão; runs anteriores
   ficam acessíveis via navegação ou toggle.

---

### User Story 3 — Agir em Gates de Decisão Humana (Priority: P3)

Quando uma ou mais features ficam bloqueadas aguardando decisão humana (status `blocked`),
o painel destaca essas features com uma indicação clara e permite ao usuário aprovar
(continuar), pular ou retentar cada uma delas diretamente pelo teclado, sem sair do TUI.

**Why this priority**: Gates humanos são o diferencial do metal-squad em relação
a scripts simples; sem uma interface para resolvê-los o usuário precisa interromper
e usar comandos separados.

**Independent Test**: Pode ser testado criando manualmente uma feature com status
`blocked` no DB e verificando que o painel a destaca e registra a ação escolhida.

**Acceptance Scenarios**:

1. **Given** uma feature com status `blocked`,
   **When** o usuário abre `msq ui`,
   **Then** a feature aparece destacada com indicação "aguardando decisão" e instruções
   de teclas de atalho disponíveis.

2. **Given** uma feature destacada como blocked,
   **When** o usuário pressiona a tecla de aprovação (ex: `a`),
   **Then** o status é atualizado para `todo` (enfileirando para reexecução) e o painel
   reflete a mudança imediatamente.

3. **Given** uma feature destacada como blocked,
   **When** o usuário pressiona a tecla de skip (ex: `s`),
   **Then** o status é marcado como `skipped` e a feature não é mais executada neste run.

---

### Edge Cases

- O que acontece quando não há nenhum run registrado no banco? O painel exibe uma
  mensagem orientando o usuário a executar `msq run` primeiro.
- O que acontece quando o banco está bloqueado por outro processo? O painel exibe
  aviso de leitura indisponível e tenta reconectar periodicamente.
- O que acontece quando a janela do terminal é muito estreita (< 60 colunas)?
  O layout colapsa para uma versão compacta de coluna única sem quebrar a renderização.
- O que acontece quando `msq ui` é aberto sem que `msq init` tenha sido executado?
  Uma mensagem orienta o usuário a rodar `msq init` no repositório atual.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O painel DEVE exibir todas as features do run mais recente de cada
  repositório registrado, com seu status atual (todo, running, done, failed, blocked).
- **FR-002**: O painel DEVE atualizar automaticamente os dados a cada intervalo
  configurável (padrão: 2 segundos) sem recarregar a tela inteira.
- **FR-003**: O painel DEVE exibir o total de tokens consumidos (input + output)
  para features com status `done`, lido da tabela `token_usage`.
- **FR-004**: O painel DEVE destacar visualmente features com status `blocked`
  e exibir atalhos de teclado para as ações disponíveis (aprovar, pular, retentar).
- **FR-005**: O usuário DEVE poder sair do TUI a qualquer momento com `q` ou `Ctrl+C`
  sem interromper um `msq run` em andamento.
- **FR-006**: O painel DEVE exibir o tempo decorrido para features com status `running`
  e a duração total para features concluídas.
- **FR-007**: O painel DEVE adaptar o layout quando a largura do terminal for inferior
  a 60 colunas, ocultando colunas secundárias e mantendo status e nome visíveis.
- **FR-008**: Quando nenhum run existir no banco, o painel DEVE exibir uma mensagem
  vazia orientadora em vez de erro.

### Key Entities

- **Run**: Representa uma execução de backlog; atributos relevantes: id, repo_id,
  feature_id, tool, status, started_at, finished_at.
- **TokenUsage**: Consumo de tokens de um run; atributos: run_id, input_tokens,
  output_tokens (ou total_tokens).
- **Gate**: Feature com status `blocked` aguardando ação humana; a ação registrada
  atualiza o status no banco para `todo` (aprovar), `skipped` (pular) ou
  reinicia a execução (retentar).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um desenvolvedor consegue abrir o painel e identificar o status de
  todas as features do run mais recente em menos de 5 segundos após executar `msq ui`.
- **SC-002**: O painel reflete mudanças de status (ex: `running` → `done`) em no
  máximo 3 segundos após a mudança ocorrer no banco.
- **SC-003**: Um desenvolvedor consegue resolver um gate bloqueado (aprovar ou pular)
  com no máximo 2 teclas, sem sair do TUI.
- **SC-004**: O painel permanece legível e navegável em terminais com largura mínima
  de 40 colunas.
- **SC-005**: Abrir o TUI enquanto um `msq run` está ativo não causa aumento mensurável
  no tempo de execução das features (overhead de leitura < 50ms por ciclo).

## Assumptions

- O banco SQLite (`~/.local/share/metal-squad/app.db`) já está inicializado com as
  tabelas `runs` e `token_usage` pelo comando `msq init`.
- O TUI é somente leitura para runs em andamento; ações de gate apenas atualizam
  o status no banco, não disparam execução diretamente (o scheduler lê o banco).
- Múltiplos repositórios podem ter runs registrados; o painel exibe todos agrupados
  por repo, com o run mais recente de cada repo expandido por padrão.
- O intervalo de refresh (2 s) é suficiente para a maioria dos casos de uso;
  não é necessário mecanismo de push/subscribe para esta versão.
- As ações de gate (aprovar/pular/retentar) funcionam mesmo quando `msq run`
  não está ativo — o próximo `msq run` lerá o status atualizado.
- A largura mínima suportada é 40 colunas; abaixo disso o comportamento não é garantido.
