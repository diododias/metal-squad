# H16 — Gate Continua Aparecendo Apos Ser Avancado

**Tipo**: Hotfix
**Status**: Pendente — triagem
**Prioridade sugerida**: Alta

## Relato do usuario (2026-07-11)

> depois de avancar os gates, ainda fica aparecendo um gate na sessao gates

## Problema

Apos resolver/avancar um gate, ele continua listado na secao de gates —
sugere que o estado do gate nao esta sendo marcado como resolvido
corretamente, ou que a UI nao esta refletindo o estado atualizado do banco
(problema de invalidacao/refresh em vez de persistencia).

## Escopo provavel

- `src/db/` — update de status do gate ao resolver
- `src/ui/` / `src/web/static/components/` — painel de gates, possivel
  cache/estado local desatualizado

## Proximo passo

Reproduzir com uma run real: resolver um gate, checar diretamente no SQLite
(`MSQ_DB_PATH`, `.claude/rules/harness.md`) se o status foi persistido
corretamente. Se o banco esta correto, e bug de refresh na UI; se o banco
ainda mostra o gate pendente, e bug na logica de resolucao.
