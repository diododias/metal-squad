# F13 — Execution Graph Visualization

**Epic**: [E03 — Orchestration v2](../epics/E03-orchestration-v2.md)
**Prioridade**: Media
**Esforco**: Medium
**Depende de**: F05

## Problema

O grafo de dependencias entre features eh invisivel na UI. O usuario nao sabe por que uma feature esta bloqueada ou qual a ordem de execucao.

## Solucao

### Visualizacao ASCII do grafo

```
feat-01 ✓ ──→ feat-02 ⟳ ──→ feat-04 ○
                              ↗
feat-03 ✓ ────────────────────
```

### Modos

- **Tree view**: hierarquia epic → feature com indent
- **Graph view**: grafo de dependencias com setas ASCII
- **Timeline view**: eixo temporal horizontal mostrando quando cada feature rodou

### Integracao

- Acessivel via `g` na TUI (toggle graph view)
- Tambem via `msq graph` no CLI (output ASCII)

## Criterios de aceite

- [ ] Grafo ASCII de dependencias renderizado na TUI
- [ ] Status de cada no (done, running, pending, failed) com cores
- [ ] Acessivel via shortcut ou comando CLI
