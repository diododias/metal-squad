# F20 — Plugin System para Adapters

**Epic**: [E05 — Developer Experience](../epics/E05-dx-improvements.md)
**Prioridade**: Media
**Esforco**: High

## Problema

Adapters sao hardcoded (claude, codex, opencode). Adicionar um novo tool (cursor, aider, continue, etc) exige modificar o codigo do msq.

## Solucao

### Plugin como modulo

Cada adapter eh um modulo que exporta uma interface padrao:

```
~/.config/metal-squad/adapters/
  cursor/
    adapter.mjs    # export default: ToolAdapter
    metadata.yaml  # name, version, description
  aider/
    adapter.mjs
    metadata.yaml
```

### Registry dinamico

```typescript
function loadAdapters(): Map<string, ToolAdapter> {
  const builtin = [claudeAdapter, codexAdapter, opencodeAdapter];
  const plugins = discoverPlugins('~/.config/metal-squad/adapters/');
  // merge, plugins override builtins com mesmo nome
}
```

### Schema update

```typescript
// ToolSchema nao eh mais enum fixo, aceita qualquer string
const ToolSchema = z.string().min(1);
```

### CLI

```bash
msq adapters                  # lista adapters disponiveis
msq adapters install <name>   # instala de registry (futuro)
```

## Criterios de aceite

- [ ] Adapters carregados dinamicamente de diretorio
- [ ] Schema aceita qualquer tool name (nao mais enum fixo)
- [ ] Builtins funcionam sem config extra
- [ ] `msq adapters` lista todos os disponiveis
