---
name: "dev-flow"
description: "Fluxo de desenvolvimento padrão: do worktree ao PR aberto."
---

# Skill: Fluxo de desenvolvimento

Fluxo padrão de uma task: do worktree ao PR aberto. **Não mergeia** — humano fecha.

→ Padrões de código: [`../../rules/`](../../rules/)
→ Branch/commit: [`../../rules/git-workflow.md`](../../rules/git-workflow.md)
→ Testes: [`../../rules/testing.md`](../../rules/testing.md)

## Etapas

1. PLAN
2. WORKTREE
3. ISSUE
4. IMPLEMENT
5. TEST
6. SONAR
7. VALIDATION
8. COMMIT
9. PUSH + OPEN PR
10. **STOP** — humano mergeia

Limpeza de worktree é um ciclo separado, executado **depois** que humano mergear.

---

### 1. PLAN
- Ler task: escopo, critério de aceitação, restrições.
- Identificar dependências (backend / storefront / módulo `craft_schedule`).
- Checklist curto do que entregar.
- Decidir branch name: `feat/NNN-slug` | `fix/NNN-slug` | `refactor/NNN-slug` (NNN = issue GitHub).

### 2. WORKTREE
- **Obrigatório** (regra inegociável #2 do CLAUDE.md).
- `EnterWorktree` com `name` casando com branch.
- Nunca editar árvore principal pra feature work.

### 3. ISSUE
- Toda demanda exige issue antes de implementar (rastreio + auto-close).
- Reaproveitar se já existir: `gh issue edit <N> --add-assignee @me`.

```bash
gh issue create \
  --title "feat(escopo): descrição curta" \
  --body "$(cat <<'EOF'
## Contexto
<por que>

## Escopo
- [ ] item 1
- [ ] item 2

## Critério de aceitação
- ...
EOF
)"
```

### 4. IMPLEMENT
- Mínimo viável primeiro. Aumentar escopo só se necessário.
- Seguir convenções: [`../../rules/coding-style.md`](../../rules/coding-style.md), [`../../rules/patterns.md`](../../rules/patterns.md), [`../../rules/ARCHITECTURE.md`](../../rules/ARCHITECTURE.md).
- Nova rota? Seguir checklist em `rules/patterns.md`.

### 5. TEST
- Cobrir nova lógica (unit ≥80%; reserva/capacidade/pagamento/webhook = 100%).
- `pnpm test` (unit) + `pnpm test:integration` (real DB, sem mock).
- Coverage obrigatória: `pnpm --filter @ecommerce-calendar-based/backend test:coverage`.
- Endpoint coverage: `pnpm --filter @ecommerce-calendar-based/backend test:coverage:endpoints` (rota nova).
- Detalhes: [`../../rules/testing.md`](../../rules/testing.md).

### 6. SONAR
- `pnpm sonar` → checar Quality Gate + BLOCKER/CRITICAL.
- Procedimento: [`../../rules/sonar.md`](../../rules/sonar.md).
- Não suprimir issue pra passar gate.

### 7. VALIDATION
- Subagente Sonnet valida o diff contra: spec da feature, checklist pre-commit, regras de arquitetura, testes e gaps de CI.
- PASS → pode commitar. FAIL → corrigir e re-rodar.

### 8. COMMIT
- Formato: `tipo(escopo): descrição em português` (pt-BR).
- Trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Tipos válidos: `feat` `fix` `refactor` `test` `docs` `chore` `perf`.
- Atualizar `.sdd-workspace/TRACKING.md` no mesmo commit (ou commit logo após).

### 9. PUSH + OPEN PR
- Docker build check: `docker build -f apps/backend/Dockerfile apps/backend` e `docker build -f apps/storefront/Dockerfile apps/storefront`.
- `git push origin <branch>`.
- Base branch = **develop** (sempre).
- `gh pr create --base develop --title "..." --body "..."`.
- Corpo **obrigatório**: `Closes #N` (compensa workflow de auto-close removido).
- Release PRs: semver manual, título `[RELEASE]`/`[PRODUCTION]`, referência em `.github/workflows/test.yml.disabled`.
- Template: [`pr-template.md`](./pr-template.md).

```bash
gh pr create \
  --base develop \
  --title "feat(escopo): descrição" \
  --body "$(cat <<'EOF'
## Resumo
<o que mudou e por quê>

## Como testar
- ...

Closes #N
EOF
)"
```

### 10. STOP
- **Nunca** `gh pr merge`. **Nunca** `git merge develop`.
- Humano decide merge (regra inegociável #4 do CLAUDE.md).

## 11. Limpeza pós-push
- Atualizar `TRACKING.md` (NEXT → DONE) se ainda não estiver.
- `ExitWorktree action: remove` ou `git worktree remove <path>`.
- `git status` limpo antes da próxima task.
- retornar para branch develop e dar git pull.

## Resumo rápido

- Worktree antes de tudo (#2).
- Issue antes de implementar.
- TDD: teste falhando precede implementação.
- PR com `Closes #N`.
- Push → Limpeza
