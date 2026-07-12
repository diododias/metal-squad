# Research: Remove OVERRIDE PONTUAL

**Feature**: 007-remove-override-pontual  
**Date**: 2026-07-11

## Research Tasks

### 1. Ordem de remocao segura

**Decision**: Remover em camadas de fora para dentro: UI → WebSocket → CLI → State/Types → CSS → Docs.

**Rationale**: Comecar pela UI garante que o usuario final nao veja mais a funcionalidade. Em seguida, remover o protocolo WebSocket e as flags CLI elimina os canais de entrada. Por ultimo, limpar state/types e CSS remove o codigo morto. Essa ordem minimiza o risco de quebrar funcionalidades existentes durante a remocao.

**Alternatives considered**:
- Remover tudo de uma vez (mais rapido, mas mais dificil de testar incrementalmente)
- Comecar pelo backend/CLI (mais arriscado pois a UI ainda tentaria enviar overrides inexistentes)

### 2. Remocao de tokenEstimatesByTool

**Decision**: Remover `tokenEstimatesByTool` do state, types, e app.js.

**Rationale**: `tokenEstimatesByTool` e consumido exclusivamente pelo `OverrideSection` no `FeaturePreview.js`. Uma vez que o OverrideSection e removido, esse estado se torna codigo morto. A funcao `collectTokenEstimatesByTool()` em `state.ts` e a propriedade no tipo `MsqWebState` devem ser removidas juntas.

**Alternatives considered**:
- Manter tokenEstimatesByTool para uso futuro (violates YAGNI — se needed later, can be re-added with proper context)

### 3. Funcao getHistoricalTokenStatsForFeatureProfile no repo.ts

**Decision**: Manter `getHistoricalTokenStatsForFeatureProfile` em `src/db/repo.ts`.

**Rationale**: Embora seja atualmente usada apenas por `collectTokenEstimatesByTool`, e uma funcao de consulta ao banco que pode ser util no futuro (ex: mostrar estimativas de custo em outras telas). Remove-la exigiria mais mudancas em um arquivo estavel (repo.ts) sem beneficio imediato. Se SC-001 (zero referencias a override) for interpretado estritamente, a funcao em si nao menciona "override" — e uma consulta de stats generica.

**Alternatives considered**:
- Remover a funcao tambem (mais limpeza, mas mais risco e diff maior)

### 4. Parametro `overrides` no comment de catalog.ts

**Decision**: Atualizar o comentario JSDoc na linha 33 de `src/ui/catalog.ts` que menciona "override".

**Rationale**: O comentario diz "F36: per-feature override for `budget.perFeatureMaxTokens`". A palavra "override" aqui se refere ao conceito de F36 (persisted per-feature config), nao ao "Override pontual" que estamos removendo. No entanto, para atender SC-001 (zero referencias a "override"), o comentario deve ser reescrito para usar "per-feature config" ou "per-feature customization".

**Alternatives considered**:
- Manter o comentario (tecnicamente correto, mas viola SC-001)

### 5. Testes existentes e overrides

**Decision**: Nenhum teste existente referencia diretamente as flags CLI `--tool`/`--model`/`--effort` como override pontual.

**Rationale**: A busca em `tests/` mostrou que `--model` aparece em testes de adapters (claude.ts, opencode.ts), mas esses testam a construcao de argumentos do adapter, nao o mecanismo de override pontual. O parametro `overrides` em factory functions de teste (ex: `makeBacklog(overrides)`) e um pattern generico de factory, nao relacionado ao override pontual. Nenhum teste precisa ser modificado.

**Alternatives considered**: N/A — sem acao necessaria.

### 6. Documentacao a atualizar

**Decision**: Atualizar 3 arquivos de documentacao:

| Arquivo | Acao |
|---------|------|
| `docs/features/F34-web-run-detail-and-control-polish.md` | Remover mencao a "override pontual de tool/model/effort" na descricao e no checklist |
| `docs/features/F36-web-feature-config-persistence.md` | Remover notas sobre coexistencia com override pontual |
| `docs/ROADMAP.md` | Atualizar linha 157 que menciona "override pontual" |

**Rationale**: SC-001 exige zero referencias. F37-remove-override-pontual.md e o feature brief desta feature e deve ser mantido como referencia historica.

**Alternatives considered**: N/A.

### 7. Footer text no FeaturePreview

**Decision**: Atualizar o texto do footer (linha 697) que menciona "with optional overrides".

**Rationale**: Apos remocao do OverrideSection, o footer deve refletir que o start e direto, sem overrides.

**Alternatives considered**: N/A.

## Summary of Findings

- **7 arquivos fonte** para modificar
- **3 arquivos de doc** para atualizar
- **0 testes** para modificar
- **0 migrations** necessarias
- **0 novas dependencias**
- `tokenEstimatesByTool` deve ser removido (codigo morto apos remocao do OverrideSection)
- `getHistoricalTokenStatsForFeatureProfile` em repo.ts deve ser mantido (funcao generica de stats)
