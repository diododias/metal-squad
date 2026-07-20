# Plano: Unificação de dependsOn e pendingDependencies com indicadores visuais

## Objetivo
Unificar os campos `dependsOn` e `pendingDependencies` em um único campo `dependsOn` no componente `FeatureConfigDetail`, usando cores para diferenciar o status de cada dependência.

## Status das dependências
- **Verde** (`--accent-ok`): dependência concluída (está em `doneFeatureIds`)
- **Amarelo** (`--accent-warn`): dependência pendente (não está em `doneFeatureIds`)
- **Vermelho** (`--accent-fail`): dependência com falha (tem status 'failed' no histórico)

## Arquivos a serem modificados

### 1. `src/web/client/components/FeatureConfigDetail.tsx`
- Adicionar `failedFeatureIds?: Set<string>` à interface `FeatureConfigDetailProps`
- Criar componente `DependencyTag` para renderizar tags com cores
- Substituir campos `dependsOn` e `pendingDependencies` por um único campo `dependsOn` com tags coloridas

### 2. `src/web/client/pages/BacklogItemDetail.tsx`
- Calcular `failedFeatureIds` a partir do `runHistories`
- Passar `doneFeatureIds` e `failedFeatureIds` para `FeatureConfigDetail`

### 3. Testes
- `tests/web/featureConfigDetail.test.tsx` — atualizar testes para nova estrutura
- `tests/web/backlog-item-detail.test.tsx` — atualizar testes para passagem de props

## Ordem de execução
1. Verificar se `doneFeatureIds` está disponível no state do cliente
2. Atualizar tipos de props
3. Implementar unificação com cores
4. Atualizar `BacklogItemDetail` para passar status
5. Atualizar testes