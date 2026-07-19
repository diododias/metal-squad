# Fix: pendingDependencies mostrando "ready" indevidamente

## Problema

No detail de um item na coluna TODO do Kanban Board (`BacklogItemDetail` → `FeatureConfigDetail`), o campo `pendingDependencies` sempre mostra **"ready"** (verde) quando o array está vazio ou undefined — mesmo quando a feature possui `dependsOn` com dependências que ainda NÃO foram concluídas.

### Sintomas observados
1. `pendingDependencies` aparece como "ready" em todas as ocasiões, inclusive quando existem dependências não concluídas
2. O botão "start feature" (Start Execution) deveria estar muted/disabled quando dependências não estão prontas
3. O correto: `pendingDependencies` deve aparecer como **"Pending"** quando houver dependências não concluídas

---

## Causa raiz

### Arquivo 1: `src/web/client/components/FeatureConfigDetail.tsx` (linha 442-444)

```tsx
{(feature.pendingDependencies?.length ?? 0) > 0
  ? feature.pendingDependencies?.map((d) => <Tag key={d}>{d}</Tag>)
  : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-ok)' }}>ready</span>}
```

**Bug:** Quando `pendingDependencies` é `undefined` ou `[]`, o componente assume "ready". Mas `pendingDependencies` pode estar vazio simplesmente porque o campo não foi populado para esta view — não significa que as dependências de `dependsOn` estão todas DONE.

### Arquivo 2: `src/web/client/pages/BacklogItemDetail.tsx` (linha 33, 36)

```tsx
const blockedByDependencies = feature?.pendingDependencies ?? [];
const canStart = blockedByDependencies.length === 0 && !repoUnhealthy;
```

**Bug:** Mesmo problema — se `pendingDependencies` for `[]` (não populado), `canStart` fica `true` indevidamente.

### Fluxo atual (onde `pendingDependencies` é calculado)

- `src/ui/catalog.ts:164-174` — `getPendingFeatures()` calcula `pendingDependencies` corretamente filtrando `dependsOn` contra `doneFeatureIds`
- `src/web/state.ts:112-126` — `collectPendingFeatures()` chama `getPendingFeatures()` corretamente
- **Mas:** features que já estão em outro estado (não pending) podem não ter `pendingDependencies` populado no `featureCatalog`

---

## Plano de correção

### Tarefa 1: Corrigir `FeatureConfigDetail.tsx` — exibir status real das dependências

**Arquivo:** `src/web/client/components/FeatureConfigDetail.tsx` (linhas 439-446)

**Mudança:** Substituir a lógica de `pendingDependencies` por uma que verifica `dependsOn` contra as dependências concluídas. O componente precisa receber `doneFeatureIds` (ou um set de dependências concluídas) como prop.

```tsx
// Antes (bug):
{(feature.pendingDependencies?.length ?? 0) > 0
  ? feature.pendingDependencies?.map((d) => <Tag key={d}>{d}</Tag>)
  : <span ...>ready</span>}

// Depois (fix):
// Se feature.dependsOn está vazio → "none" (sem dependências)
// Se pendingDependencies.length > 0 → Tags com as pendentes + badge "Pending"
// Se pendingDependencies.length === 0 E dependsOn.length > 0 → "ready" (verde)
```

Passo a passo:
1. Adicionar prop `doneFeatureIds?: Set<string>` no `FeatureConfigDetailProps`
2. Calcular status de cada dependência individualmente:
   - Para cada item em `feature.dependsOn`, verificar se está em `doneFeatureIds`
   - Mostrar cada dependência com tag colorida: verde se done, amarela/vermelha se pending
3. Se todas as dependências estão done → badge "ready" (verde)
4. Se há pendentes → badge "Pending" (amarelo/vermelho)
5. Se não tem dependsOn → mostrar "none"

### Tarefa 2: Corrigir `BacklogItemDetail.tsx` — propagar `doneFeatureIds`

**Arquivo:** `src/web/client/pages/BacklogItemDetail.tsx`

**Mudança:** O componente já tem acesso a `state` que contém o catálogo. Precisamos extrair ou receber `doneFeatureIds` e passar para `FeatureConfigDetail`.

Passo a passo:
1. Verificar se `doneFeatureIds` já existe no state do cliente (provavelmente sim via `collectPendingFeatures` no servidor)
2. Se não existir no state do cliente, adicionar um campo `doneFeatureIds` ao estado retornado pelo servidor
3. Passar `doneFeatureIds` como prop para `FeatureConfigDetail`

### Tarefa 3: Corrigir `canStart` no `BacklogItemDetail.tsx`

**Arquivo:** `src/web/client/pages/BacklogItemDetail.tsx` (linha 36)

**Mudança:** Usar `dependsOn` + `doneFeatureIds` como fonte de verdade em vez de depender apenas de `pendingDependencies`.

```tsx
// Antes:
const blockedByDependencies = feature?.pendingDependencies ?? [];
const canStart = blockedByDependencies.length === 0 && !repoUnhealthy;

// Depois:
const doneFeatureIds = state.doneFeatureIds ?? new Set();
const blockedByDependencies = feature?.dependsOn.filter(dep => !doneFeatureIds.has(dep)) ?? [];
const canStart = blockedByDependencies.length === 0 && !repoUnhealthy;
```

### Tarefa 4: Garantir que `doneFeatureIds` está disponível no state do cliente

**Arquivo:** `src/web/state.ts` ou `src/web/server.ts`

**Verificar:** O servidor já calcula `doneFeatureIds` via `listCompletedFeatureIds()`. Precisamos garantir que esse set é enviado ao cliente no state snapshot.

Se não estiver:
1. Adicionar `doneFeatureIds: string[]` ao tipo do state do cliente
2. Popular no `collectPendingFeatures` ou no endpoint que monta o state
3. Serializar como array (Sets não serializam em JSON)

### Tarefa 5: Corrigir tooltip do botão "start feature"

**Arquivo:** `src/web/client/pages/BacklogItemDetail.tsx` (linhas 82-88)

**Mudança:** O tooltip já mostra `Pending dependencies: ${blockedByDependencies.join(', ')}` quando há pendentes — apenas garantir que `blockedByDependencies` agora é calculado corretamente (via Tarefa 3).

### Tarefa 6: Atualizar testes

**Arquivos:**
- `tests/web/featureConfigDetail.test.tsx` — adicionar cenário onde `pendingDependencies` está vazio mas `dependsOn` tem itens não concluídos → deve mostrar "Pending", não "ready"
- `tests/web/backlog-item-detail.test.tsx` — adicionar cenário onde `canStart` deve ser `false` quando dependências não estão done

---

## Ordem de execução

1. **Tarefa 4** — Garantir que `doneFeatureIds` está no state do cliente (pré-requisito)
2. **Tarefa 1** — Corrigir `FeatureConfigDetail.tsx` display
3. **Tarefa 2** — Propagar `doneFeatureIds` em `BacklogItemDetail.tsx`
4. **Tarefa 3** — Corrigir `canStart` logic
5. **Tarefa 5** — Verificar tooltip
6. **Tarefa 6** — Testes

---

## Verificação

1. Abrir o Kanban Board no browser
2. Clicar em um item da coluna TODO que tem `dependsOn` com dependências não concluídas
3. **Esperado:** Campo "pendingDependencies" mostra as dependências pendentes com badge "Pending" (não "ready")
4. **Esperado:** Botão "start feature" aparece desabilitado/muted
5. **Esperado:** Tooltip do botão mostra "Pending dependencies: X, Y"
6. Quando todas as dependências estiverem DONE → campo mostra "ready" (verde) e botão habilita
7. Rodar testes: `rtk test`
