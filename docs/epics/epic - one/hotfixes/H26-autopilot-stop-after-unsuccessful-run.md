# H26 — Autopilot só avança após conclusão bem-sucedida

**Tipo**: Hotfix
**Status**: Concluído
**Prioridade**: Alta
**Descoberto em**: 2026-07-16

## Problema

O autopilot considerava `failed-execution` elegível para buscar e disparar a
próxima feature com `autoStart`. Com isso, uma sessão que falhava podia ser
seguida por outro trabalho automático sem intervenção humana.

## Correção

Somente o resultado `success` avalia uma próxima candidata. Toda conclusão
não bem-sucedida gera uma decisão `stop`, não dispara processo filho e mantém
a notificação `run:failed` para os canais humanos configurados.

## Evidência

As suites de autopilot e runner cobrem tanto o avanço após sucesso quanto a
ausência de `spawn` e o evento `run:failed` após falha.
