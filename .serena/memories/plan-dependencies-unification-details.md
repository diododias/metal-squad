# Detalhes da Implementação: Unificação de dependsOn e pendingDependencies

## Status
- [x] FeatureConfigDetail.tsx - props e DependencyTag
- [x] FeatureConfigDetail.tsx - substituição de campos
- [x] BacklogItemDetail.tsx - cálculo e passagem de props
- [x] Testes atualizados

## Contexto
- `doneFeatureIds` já está disponível no `MsqWebState` (linha 117 de `src/web/types.ts`)
- O componente `BacklogItemDetail` já converte para `Set<string>` (linha 33)
- `runHistories` é passado como prop para `BacklogItemDetail`

## Implementação por arquivo

### 1. `src/web/client/components/FeatureConfigDetail.tsx`

**Alterações:**
1. Adicionar `failedFeatureIds?: Set<string>` à interface `FeatureConfigDetailProps` (após linha 82)
2. Criar componente `DependencyTag` antes do componente principal
3. Substituir linhas 434-449 por implementação unificada

**Código do componente DependencyTag:**
```tsx
function DependencyTag({ depId, doneFeatureIds, failedFeatureIds }: { 
  depId: string; 
  doneFeatureIds?: Set<string>; 
  failedFeatureIds?: Set<string>;
}): React.JSX.Element {
  const isDone = doneFeatureIds?.has(depId);
  const isFailed = failedFeatureIds?.has(depId);
  
  let bgColor = 'var(--accent-warn)'; // amarelo (pendente)
  if (isDone) bgColor = 'var(--accent-ok)'; // verde
  if (isFailed) bgColor = 'var(--accent-fail)'; // vermelho
  
  return (
    <Tag style={{ 
      backgroundColor: bgColor,
      color: 'white',
      fontWeight: 600,
      border: 'none'
    }}>
      {depId}
    </Tag>
  );
}
```

**Código unificado para dependsOn (substitui linhas 434-449):**
```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
  <span style={{ color: 'var(--text-dim)' }}>dependsOn</span>
  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
    {feature.dependsOn.length ? (
      feature.dependsOn.map((d) => (
        <DependencyTag 
          key={d} 
          depId={d} 
          doneFeatureIds={doneFeatureIds} 
          failedFeatureIds={failedFeatureIds} 
        />
      ))
    ) : (
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>none</span>
    )}
  </div>
</div>
```

### 2. `src/web/client/pages/BacklogItemDetail.tsx`

**Alterações:**
1. Calcular `failedFeatureIds` após linha 33
2. Passar `failedFeatureIds` para `FeatureConfigDetail` (após linha 120)

**Cálculo de failedFeatureIds:**
```tsx
const failedFeatureIds = new Set<string>();
for (const [featureId, history] of Object.entries(runHistories)) {
  if (history.some(run => run.status === 'failed')) {
    failedFeatureIds.add(featureId);
  }
}
```

**Passagem de props:**
```tsx
<FeatureConfigDetail
  feature={feature}
  backlogSettings={state.backlogSettings}
  approvalChannels={state.runtimeConfig.notifications.channels.map((channel) => channel.type)}
  toolIds={state.runtimeConfig.tools.map((tool) => tool.id)}
  onSaveConfig={(patch) => { onSaveConfig(featureId, patch); }}
  workflowSaveResult={workflowSaveResult}
  doneFeatureIds={doneFeatureIds}
  failedFeatureIds={failedFeatureIds}
/>
```

### 3. Testes

**Arquivos a atualizar:**
- `tests/web/featureConfigDetail.test.tsx` — adicionar testes para cores
- `tests/web/backlog-item-detail.test.tsx` — verificar passagem de props

## Verificação visual
1. Verde: dependência concluída
2. Amarelo: dependência pendente  
3. Vermelho: dependência com falha
4. Sem campo `pendingDependencies` separado