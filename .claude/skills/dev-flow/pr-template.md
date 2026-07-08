<!--
PR template canonico para o repo metal-squad.
Use como base e remova secoes que nao se aplicam.
-->

## Resumo
<o que mudou e por que>

## Referencias
- Feature/Hotfix: `docs/features/FXX-*.md` ou `docs/hotfixes/HXX-*.md`
- Issue: `Closes #N` ou `Refs #N`

## Contexto tecnico
- Area principal: `commands` | `core/backlog` | `core/skills` | `core/adapters` | `db` | `ui` | `docs/skills`
- Motivacao: feature nova | hotfix | refactor | harness | docs

## Mudancas principais
- [ ] CLI / comandos
- [ ] Backlog / prompt / skills
- [ ] Adapters / runner / observabilidade
- [ ] DB / config / persistencia
- [ ] UI Ink
- [ ] Docs / skills / rules

## Validacao executada
- [ ] `rtk npm run build`
- [ ] `rtk npm test`
- [ ] `rtk npm run typecheck`
- [ ] `rtk npm run lint` (se aplicavel)
- [ ] `rtk npx vitest run ...` focado nas suites alteradas
- [ ] validacao live com o banco default (`~/.local/share/metal-squad/app.db`); usar `MSQ_DB_PATH` apenas se o harness estiver sandboxado (se aplicavel)

## Evidencias / comandos
```bash
<liste os comandos principais e o resultado resumido>
```

## Riscos e follow-ups
- <risco real, blind spot ou item intentionally out-of-scope>
