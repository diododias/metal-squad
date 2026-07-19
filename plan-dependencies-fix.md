# Unificação de dependsOn e pendingDependencies com indicadores visuais de status

## Problema

No detail de um item na coluna TODO do Kanban Board (`BacklogItemDetail` → `FeatureConfigDetail`), existem dois campos duplicados: `dependsOn` e `pendingDependencies`. Isso confunde o usuário e dificulta a visualização do status real das dependências.

### Situação atual
1. `dependsOn` mostra todas as dependências declaradas
2. `pendingDependencies` mostra apenas as pendentes (mas com bug que mostra "ready" indevidamente)
3. Não há indicação visual clara do status de cada dependência individualmente

---

## Solução proposta

Unificar os campos `dependsOn` e `pendingDependencies` em um único campo `dependsOn`, usando **cores** para diferenciar o status de cada dependência:

- **Verde** (`--accent-ok`): dependência concluída (está em `doneFeatureIds`)
- **Amarelo** (`--accent-warn`): dependência pendente (não está em `doneFeatureIds`)
- **Vermelho** (`--accent-fail`): dependência com falha (tem status 'failed' no histórico)

---

## Plano de implementação

### Tarefa 1: Modificar `FeatureConfigDetail.tsx` — unificar campos e implementar cores

**Arquivo:** `src/web/client/components/FeatureConfigDetail.tsx`

**Mudanças:**
1. Remover o campo `pendingDependencies` da exibição (linhas 440-449)
2. Modificar o campo `dependsOn` (linhas 434-438) para mostrar cada dependência com cor baseada no status
3. Adicionar novas props para receber informações de status:
   - `doneFeatureIds?: Set<string>` — IDs das features concluídas
   - `failedFeatureIds?: Set<string>` — IDs das features que falharam

**Implementação:**
```tsx
// Novo componente para tag de dependência com cor
function DependencyTag({ depId, doneFeatureIds, failedFeatureIds }: { 
  depId: string; 
  doneFeatureIds?: Set<string>; 
  failedFeatureIds?: Set<string>;
}): React.JSX.Element {
  const isDone = doneFeatureIds?.has(depId);
  const isFailed = failedFeatureIds?.has(depId);
  
  let color = 'var(--accent-warn)'; // padrão: amarelo (pendente)
  if (isDone) color = 'var(--accent-ok)'; // verde
  if (isFailed) color = 'var(--accent-fail)'; // vermelho
  
  return (
    <Tag style={{ 
      backgroundColor: color,
      color: 'white',
      fontWeight: 600
    }}>
      {depId}
    </Tag>
  );
}

// No render do campo dependsOn:
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

### Tarefa 2: Atualizar `BacklogItemDetail.tsx` — passar informações de status

**Arquivo:** `src/web/client/pages/BacklogItemDetail.tsx`

**Mudanças:**
1. Calcular `failedFeatureIds` a partir do histórico de execuções
2. Passar `doneFeatureIds` e `failedFeatureIds` para `FeatureConfigDetail`

**Implementação:**
```tsx
// No início do componente:
const doneFeatureIds = new Set(state.doneFeatureIds);

// Calcular failedFeatureIds a partir do histórico
const failedFeatureIds = new Set<string>();
for (const [featureId, history] of Object.entries(runHistories)) {
  if (history.some(run => run.status === 'failed')) {
    failedFeatureIds.add(featureId);
  }
}

// No render do FeatureConfigDetail:
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

### Tarefa 3: Atualizar tipos de props do `FeatureConfigDetail`

**Arquivo:** `src/web/client/components/FeatureConfigDetail.tsx`

**Mudança:** Adicionar `failedFeatureIds` à interface `FeatureConfigDetailProps`.

```tsx
export interface FeatureConfigDetailProps {
  feature: FeatureCatalogEntry;
  backlogSettings: BacklogSettings;
  approvalChannels?: string[];
  onSaveConfig: (patch: FeatureConfigPatch) => void;
  onSaveTaskConfig?: (taskId: string, patch: TaskConfigPatch) => void;
  workflowSaveResult?: FeatureConfigSaveResult;
  toolIds?: string[];
  doneFeatureIds?: Set<string>;
  failedFeatureIds?: Set<string>; // Nova prop
}
```

### Tarefa 4: Verificar se `doneFeatureIds` está disponível no state do cliente

**Arquivo:** `src/web/types.ts`

**Verificar:** Se `doneFeatureIds` já existe no `MsqWebState`. Se não, adicionar.

**Implementação (se necessário):**
```tsx
export interface MsqWebState {
  // ... campos existentes
  doneFeatureIds: string[]; // Já existe conforme análise anterior
  // ...
}
```

### Tarefa 5: Atualizar testes

**Arquivos:**
- `tests/web/featureConfigDetail.test.tsx` — atualizar testes para usar as novas props e verificar cores
- `tests/web/backlog-item-detail.test.tsx` — atualizar testes para verificar passagem de `failedFeatureIds`

---

## Ordem de execução

1. **Tarefa 4** — Verificar disponibilidade de `doneFeatureIds` no state (pré-requisito)
2. **Tarefa 3** — Atualizar tipos de props
3. **Tarefa 1** — Implementar unificação com cores no `FeatureConfigDetail`
4. **Tarefa 2** — Atualizar `BacklogItemDetail` para passar status
5. **Tarefa 5** — Atualizar testes

---

## Verificação

1. Abrir o Kanban Board no browser
2. Clicar em um item da coluna TODO que tem `dependsOn` com dependências
3. **Esperado:** Campo "dependsOn" mostra todas as dependências com cores:
   - Verde para dependências concluídas
   - Amarelo para dependências pendentes
   - Vermelho para dependências com falha
4. **Esperado:** Não há mais campo separado "pendingDependencies"
5. **Esperado:** Botão "start feature" continua funcionando corretamente
6. Rodar testes: `rtk test`
