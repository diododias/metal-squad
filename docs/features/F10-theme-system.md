# F10 — Theme System

**Epic**: [E02 — Modern TUI](../epics/E02-modern-tui.md)
**Prioridade**: Baixa
**Esforco**: Low

## Problema

Cores sao hardcoded nos componentes. Nao ha como customizar a aparencia.

## Solucao

### Theme object centralizado

```typescript
interface Theme {
  primary: string;      // cyan
  success: string;      // green
  error: string;        // red
  warning: string;      // yellow
  muted: string;        // dim
  accent: string;       // magenta
  bg: string;           // (terminal default)
}
```

### Temas built-in

- `default` — cores atuais
- `dark` — otimizado para terminais escuros
- `light` — otimizado para terminais claros
- `minimal` — monocromatico (para terminais limitados)

### Config

```json
{ "theme": "dark" }
```

## Criterios de aceite

- [ ] Componentes usam theme object, nao cores hardcoded
- [ ] Pelo menos 2 temas built-in
- [ ] Tema configuravel via config
