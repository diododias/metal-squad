# Research: Remover tab "Features & Prompts" do Config

## Decision: manter a mudança isolada em `ConfigPage.tsx`

**Rationale**: a busca no código-fonte confirmou que a tab removida é montada
localmente em `src/web/client/pages/ConfigPage.tsx`. A entrada de navegação, o
componente `FeaturesPromptsTab`, o `case` correspondente e o texto do header
estão no mesmo arquivo. O componente compartilhado `FeatureConfigDetail` também
é usado pelos fluxos de detalhe e deve permanecer intacto.

**Alternatives considered**: remover ou alterar `FeatureConfigDetail` foi
descartado porque isso ampliaria o escopo e poderia quebrar a edição pelo card;
alterar rotas globais foi descartado porque não há rota dedicada para a sub-tab.

## Decision: não criar contrato externo nem migração de dados

**Rationale**: trata-se de remoção de apresentação no dashboard web. Não há
mudança de API, websocket message, persistência, schema SQLite ou formato de
backlog.

**Alternatives considered**: adicionar redirecionamento/depreciação foi
descartado porque a especificação determina remoção direta sem aviso.

## Decision: validar com gates do projeto e inspeção visual

**Rationale**: `npm run build`, `npm test`, `npm run typecheck` e `npm run lint`
cobrem compilação, regressões existentes e referências TypeScript. Uma busca
textual no código e a inspeção do dashboard cobrem a ausência da navegação e do
header removidos. O fluxo compartilhado de edição continua coberto por
`tests/web/featureConfigDetail.test.tsx`.

**Alternatives considered**: criar um teste dedicado para `ConfigPage` foi
considerado, mas não é necessário para esta remoção simples; a ausência de
referência e a validação manual da lista de tabs cobrem o comportamento novo.
