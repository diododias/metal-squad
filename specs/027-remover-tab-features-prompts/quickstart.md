# Quickstart: Remover tab "Features & Prompts" do Config

## Pré-requisitos

- Build atualizado do dashboard web: `rtk npm run build`
- `msq web` rodando localmente

## Passos de validação

1. Rode os gates automatizados:
   ```bash
   rtk npm run build
   rtk npm test
   rtk npm run typecheck
   rtk npm run lint
   ```
2. Rode uma busca textual apenas no código-fonte por `"Features & Prompts"` e
   `"FeaturesPromptsTab"` e confirme que não há resultados (SC-003):
   ```bash
   rtk rg -n "Features & Prompts|FeaturesPromptsTab" src tests
   ```
3. Inicie `msq web`, abra a página de Config no navegador e confirme:
   - a lista de sub-tabs mostra apenas: Runtime, Defaults, Skills, Notifications,
     Budget (sem "Features & Prompts");
   - o texto do header não contém mais "except Features & Prompts".
4. Abra o card de detalhe de uma feature (via Backlog ou Run detail) e confirme
   que a edição de configuração da feature (`FeatureConfigDetail`) continua
   funcionando normalmente — fluxo não afetado por esta mudança (M1).

## Expected Outcome

- ConfigPage renderiza sem a sub-tab de features em qualquer estado.
- Nenhuma referência órfã a `FeaturesPromptsTab` no código-fonte.
- Edição de feature pelo card continua 100% funcional.
