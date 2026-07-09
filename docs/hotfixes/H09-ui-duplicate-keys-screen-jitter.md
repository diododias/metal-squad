# H09 — TUI com chaves duplicadas provoca trepidacao visual e warnings do React/Ink

**Tipo**: Hotfix
**Status**: Resolvido
**Prioridade**: Critica
**Descoberto em**: 2026-07-07
**Resolvido em**: 2026-07-07
**Comando observado**: `msq ui` via terminal integrado do VSCode

## Problema

Ao usar a TUI no terminal do VSCode, a tela trepida e o React/Ink emite warnings
do tipo:

```text
Encountered two children with the same key
```

Esse sintoma indica reconciliacao instavel em listas dinamicas da interface. No
contexto do Ink, quando itens entram/saem rapidamente (runs, gates,
notifications, task lists, output entries), chaves nao deterministicas ou
colidentes fazem o renderer reciclar nodes errados, gerando flicker, scroll
instavel e repaints desnecessarios.

## Impacto

- reduz a confiabilidade visual do `msq ui`
- dificulta acompanhar runs em tempo real no terminal do VSCode
- mascara outros problemas reais de layout, porque o renderer entra em estado
  ruidoso

## Hipotese tecnica inicial

Os componentes da TUI ja renderizam varias colecoes simultaneas em `src/ui/`:

- `Sidebar.tsx`
- `MainPanel.tsx`
- `NotificationsFeed.tsx`
- `RunTable.tsx`
- `GatePanel.tsx`
- overlays/atalhos com registros dinamicos

O hotfix deve assumir que o problema pode estar em mais de uma lista e validar:

1. colisoes de `key` entre siblings gerados na mesma renderizacao
2. uso de indices como identificador em colecoes sujeitas a reorder
3. ids reaproveitados entre views compactas e completas
4. combinacoes `kind:id` que deixam de ser unicas quando itens sinteticos e
   persistidos compartilham namespace

## Resolucao esperada

- auditar todos os `key=` de listas dinâmicas da TUI
- trocar chaves ambiguas por ids estaveis derivados do dominio real do item
- adicionar cobertura de teste para colecoes com entradas repetidas/reordenadas
- confirmar que `msq ui` deixa de emitir o warning e para de trepidar no VSCode

## Resolucao aplicada

- `listRuns*` passou a consumir apenas o snapshot mais recente de `token_usage` por
  run, evitando multiplicacao de linhas na TUI
- a persistencia de telemetria agora trata `token_usage` como historico de
  snapshots, sem quebrar as queries de overview/status
- chaves de listas dinamicas com potencial de colisao foram reforcadas em areas
  como help overlay, skills renderizadas e listas derivadas
- cobertura de UI/DB foi atualizada para proteger esse comportamento

## Criterios de aceite

- [x] Nenhum warning de `children with same key should be unique` aparece ao abrir ou navegar no `msq ui`
- [x] A TUI permanece visualmente estavel no terminal integrado do VSCode durante updates de runs/gates/notifications
- [x] Listas dinamicas relevantes possuem chaves estaveis e cobertas por teste
- [x] A correcao nao introduz regressao na navegacao por teclado nem no refresh em tempo real
