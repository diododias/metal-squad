<!--
PR gerado/assistido por IA (Claude Code).
Validar todas as alegações contra o código antes de aprovar.
-->

## Resumo
<o que mudou e por quê — 1 a 3 frases>

## Issue
Closes #N

<!-- Use `Refs #N` em vez de `Closes` se a entrega for parcial. -->

## Spec / Plan
<!-- Se feature: links pros arquivos de spec/plan -->
- Spec: `specs//NNN-slug/spec.md`
- Plan: `specs//NNN-slug/plan.md`

## Mudanças principais
- [ ] Backend (`apps/backend/`):
- [ ] Storefront (`apps/storefront/`):
- [ ] Módulo `craft_schedule`:
- [ ] Migration:
- [ ] Outro:

## Como testar
1. ...
2. ...

## Test plan
- [ ] `pnpm test` (unit) passou
- [ ] `pnpm test:integration` (real DB) passou — se tocou backend
- [ ] `pnpm test:e2e` passou — se tocou storefront
- [ ] HTTP spec criado/atualizado em `integration-tests/http/<slug>.spec.ts` ou allowlist
- [ ] `pnpm lint && pnpm arch` verde

## Cobertura e Sonar
- [ ] Cobertura ≥ 80% no código novo (100% em reserva/capacidade/pagamento/webhook)
- [ ] `pnpm sonar` rodado — Quality Gate `OK`
- [ ] Zero issues `BLOCKER`/`CRITICAL` em `BUG`/`VULNERABILITY` novos
- [ ] `SECURITY_HOTSPOT` revisados manualmente

## Arquitetura (Clean Arch)
- [ ] `domain/` / `application/` / `ports/` sem `@medusajs/*` (ARQ-01)
- [ ] `api/` / `jobs/` / `subscribers/` sem import direto de `CraftScheduleService` (ARQ-02)
- [ ] Validação Zod em toda fronteira (HTTP body/query, webhooks, env vars)

## Tracking
- [ ] `.sdd-workspace/TRACKING.md` atualizado (NEXT → DOING/DONE)

## Segurança
- [ ] Sem segredos hardcoded
- [ ] Sem `console.log` de dados sensíveis (CPF, cartão, endereço completo)
- [ ] Webhook MP valida HMAC-SHA256 antes de processar — se tocou webhook

## Limitações conhecidas / blind spots IA
- [ ] Revisei o código gerado e entendi como funciona
- [ ] Dependências novas justificadas e necessárias
- [ ] Sem libs deprecadas
