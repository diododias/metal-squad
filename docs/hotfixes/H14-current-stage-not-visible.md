# H14 — Etapa/Stage Atual Nao Fica Visivel na UI

**Tipo**: Hotfix / Melhoria de UX
**Status**: Pendente — triagem
**Prioridade sugerida**: Alta
**Relaciona**: F24 (Task & Stage Progress), F40 (visualizacao por step)

## Relato do usuario (2026-07-11)

> nao estou conseguindo ver que etapa esta

## Problema

Usuario nao consegue identificar visualmente em qual stage/step do workflow
uma feature em execucao se encontra. F24 (Task & Stage Progress) esta listada
como "Em progresso" no ROADMAP — este relato pode ser sintoma de F24
incompleto, nao um bug novo isolado.

## Escopo provavel

- `src/core/events/` — eventos de mudanca de stage
- `src/ui/` / `src/web/static/components/` — indicador de stage atual

## Proximo passo

Verificar o status real de implementacao de F24 antes de tratar como item
separado — provavel que este relato feche o escopo pendente de F24 em vez de
abrir trabalho novo. Ver tambem F40, que pede uma visualizacao dedicada por
step (feature nova, mais ampla que so "mostrar o stage atual").
