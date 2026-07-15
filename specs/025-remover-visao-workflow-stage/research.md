# Research: Remover visão "by workflow stage"

## Escopo confirmado por análise de código

**Decision**: Toda a mudança fica contida em `src/web/client/pages/BoardPage.tsx`.

**Rationale**: `get_symbols_overview` em `BoardPage.tsx` mostra `WORKFLOW_STAGES` como a única
constante do arquivo e `BoardPage` como o único componente que a referencia. Um grep por
`viewMode|WORKFLOW_STAGES` em todo `src/` e `tests/` (excluindo `node_modules`) retorna apenas
`src/web/client/pages/BoardPage.tsx`. Não existe import externo desses símbolos, nem tipo
exportado que os exponha para outro módulo.

**Alternatives considered**: Nenhuma — não há ambiguidade sobre o arquivo afetado nem
necessidade de investigar dependências cruzadas.

## Cobertura de teste existente

**Decision**: Não existe suite dedicada a `BoardPage` hoje em `tests/web/`; a Fase 1 precisa
adicionar um teste novo (`tests/web/board-page.test.tsx`) para satisfazer SC-001.

**Rationale**: `tests/web/` contém `kanban-card.test.tsx`, `feature-identity.test.tsx`,
`featureConfigDetail.test.tsx`, `editable-controls.test.tsx`, `state.test.ts`, `client.test.ts`,
`server.test.ts`, `auth.test.ts`, `status.test.ts`, `transcript.test.ts` — nenhum cobre
`BoardPage` diretamente. O padrão de teste de componente React usado no repo
(`kanban-card.test.tsx`, `feature-identity.test.tsx`) não usa `@testing-library/react` com DOM
completo; segue análise de árvore JSX/props, alinhado ao padrão Ink documentado em
`.claude/rules/harness.md` para testes de UI sem render de DOM real.

**Alternatives considered**: Testar apenas via `msq web` live foi descartado — a regra de
harness (`.claude/rules/harness.md`) e a constitution (Princípio III) exigem cobertura
automatizada ou justificativa documentada, e validação live não substitui teste unitário quando
uma suite focada pode cobrir o caso.

## Impacto em dados/contratos

**Decision**: Não há impacto em contratos de API, schema SQLite ou payload trocado entre
backend e client — `viewMode` e `WORKFLOW_STAGES` são estado e constante locais de
`BoardPage.tsx`, não campos vindos do backend.

**Rationale**: A spec já assume isso (`## Assumptions`), e a ausência de qualquer ocorrência de
`viewMode`/`WORKFLOW_STAGES` fora de `BoardPage.tsx` confirma que nenhum outro módulo (server,
db, tipos compartilhados) depende desses símbolos.

**Alternatives considered**: N/A.

## Resultado

Nenhuma cláusula "NEEDS CLARIFICATION" restante no Technical Context do plano.
