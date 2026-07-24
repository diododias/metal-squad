# Feature Specification: Bloco Tool/Adapter (desktop lado-a-lado, mobile empilhado)

**Feature Branch**: `feat/vr19-bloco-tool-adapter`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M5 (Tema E)
**Depende de**: VR-18

## Objetivo

Separar a configuração de execução num bloco próprio **Tool / Adapter**, com os
campos `Tool / Model / Effort / Thinking / Max Tokens` dispostos **lado a lado no
desktop** (melhor uso de tela) e **empilhados no mobile**.

## Contexto de execução

- Esses campos já existem em `components/FeatureConfigDetail.tsx`: o draft de
  execução tem `tool`, `model`, `effort`, `thinking`, `maxTokens`, `autoStart`
  (`:31-35`, `:182-186`), com validação de `maxTokens` (`:352-356`) e avisos de
  capacidade por tool (`model/effort/thinking` ignorados quando o tool não
  suporta — `:360-365`). O save é por bloco de execução (`executionPatch`).
- Hoje esses campos convivem no mesmo bloco que `autoStart`/workflow; a
  separação Tool/Adapter × Behaviour (VR-20) é a mudança.
- Responsividade: `Responsive.tsx` expõe `useIsMobile` (já usado na Run Detail).

O que **falta**: extrair um bloco "Tool / Adapter" só com os 5 campos de
execução, com layout `grid` lado-a-lado no desktop e empilhado no mobile;
`autoStart` sai daqui e vai para Behaviour (VR-20).

## Modelo técnico

- Novo agrupamento em `FeatureConfigDetail` (ou subcomponente
  `ToolAdapterBlock`): `grid` responsivo (`useIsMobile` → 1 coluna; desktop →
  campos lado a lado). Reusa os `Editable*Field` e a validação/avisos já
  existentes.
- Preserva `executionPatch`/baseline e a lógica de capacidades por tool
  (`executionCapabilities`).

## Requirements

- Bloco "Tool / Adapter" contém só `Tool/Model/Effort/Thinking/Max Tokens`.
- Desktop: campos lado a lado; mobile: empilhados.
- Validação de `maxTokens` e avisos de capacidade por tool preservados.

## Arquivos afetados

- `src/web/client/components/FeatureConfigDetail.tsx` (extração do bloco),
  `pages/BacklogItemDetail.tsx`.
- `tests/web/` — layout responsivo; campos corretos no bloco.

## Success Criteria

- **SC-001**: no desktop, os 5 campos aparecem lado a lado num bloco Tool/Adapter.
- **SC-002**: no mobile, os campos empilham.
- **SC-003**: validação de maxTokens e avisos de capacidade continuam
  funcionando.
