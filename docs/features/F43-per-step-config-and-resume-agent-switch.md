# F43 — Editar Tool/Effort por Step + Retomar com Outro Agente (UI)

**Tipo**: Feature
**Status**: Pendente — triagem
**Prioridade sugerida**: Media
**Relaciona**: F36 (Web Feature/Task Config Persistence), F39 (Adapter Fallback Resume)

## Relato do usuario (2026-07-11)

> permitir editar tool/effort por step
> permitir alterar tool e modelo para retomar em outro agente

## Problema

F36 ja tornou tool/model/effort editavel a nivel de feature. O pedido agora e
granularidade por step dentro da mesma feature, e a segunda parte
(`msq resume --tool/--model`) ja existe no CLI via F39 — falta expor essa
troca de agente na UI/dashboard para retomar sem precisar do terminal.

## Escopo provavel

- `src/core/backlog/` — schema para override de tool/effort por step (hoje e
  por feature, ver F01 schema v2)
- `src/web/static/components/` — form de config (extensao do form de F36) +
  UI de resume expondo tool/model override (hoje so via CLI, F39)
- `src/commands/` — comando `run`/`resume` ja aceitam override; validar
  contrato antes de expor na UI

## Proximo passo

Confirmar em `docs/features/F36-web-feature-config-persistence.md` e
`F39-adapter-fallback-resume.md` o que ja e persistivel/exposto hoje, para
nao duplicar mecanismo — a diferenca aqui e granularidade (por step) e
superficie (UI em vez de so CLI).
