# F37 — Remove OVERRIDE PONTUAL Feature

**Epic**: [E01 — Skills System](../epics/E01-skills-system.md)  
**Prioridade**: Media  
**Esforco**: Medium  
**Depende de**: F36 (web feature/task config persistence)

## Problema

A feature "OVERRIDE PONTUAL" (one-time override) foi implementada em F34 como um jeito temporario de aplicar overrides a features sem persistir no banco. Desde F36, usuarios podem agora editar e salvar parametros de feature persistentemente via web UI.

**Redundancia**: OVERRIDE PONTUAL suporta apenas `tool`, `model`, `effort` — exatamente os parametros que F36 ja persiste. Alem disso, F36 oferece parametros adicionais que OVERRIDE PONTUAL nunca suportou (`maxTokens`, `skills`, `workflow`, `retry`, `dependsOn`).

**Confusao UX**: Dois caminhos coexistem simultaneamente (override vs save config), levando usuarios a duvidar qual usar. A intencao era que save config fosse a escolha unica.

## Solucao

Remover completamente a infrastructure de OVERRIDE PONTUAL:

1. **UI** (`src/web/static/components/FeaturePreview.js`):
   - Deletar componente `OverrideSection` (linhas 366–413)
   - Remover estado de override (override tool/model/effort)
   - Remover handlers e logica de passagem de overrides ao iniciar feature

2. **Styles** (`src/web/static/styles.css`):
   - Remover `.override-fields` CSS (linhas 623–645)

3. **WebSocket Protocol** (`src/web/types.ts`):
   - Remover propriedade `overrides?: { tool?, model?, effort? }` das mensagens

4. **Web Server** (`src/web/server.ts`):
   - Simplificar `startFeature()` para nao processar/passar overrides

5. **CLI** (`src/commands/run.ts`):
   - Remover flags `--tool`, `--model`, `--effort` (opcoes CLI)
   - Remover logica de in-memory mutation para overrides
   - Runtime passa a ler configuracao persistida do banco (F35) sem override

6. **App Frontend** (`src/web/static/app.js`):
   - Remover logica de envio de overrides ao server

7. **Documentacao**:
   - F34 spec: remover referencias a OVERRIDE PONTUAL, manter F34 como cleanups polidos
   - F36 spec: adicionar nota explicando que F36 persistence superseeds override pontual
   - `README.md`: atualizar exemplos/fluxos para nao mencionar override

## Design

### Nao ha nova feature — so remocao

Nenhum campo schema novo, nenhuma migration de banco, nenhuma API nova. A remocao e pura limpeza tecnica.

### Fluxo simplificado

**Antes** (com override):
1. Abrir feature detail
2. Escolher entre "Override pontual" (temporario) ou "Save Config" (persistente)
3. Se override: passa CLI flags, run usa in-memory mutation
4. Se save config: persiste ao banco, proximo run le do banco

**Depois** (sem override):
1. Abrir feature detail
2. Editar qualquer parametro
3. Clicar "Save Config"
4. Persistido ao banco, proximo run le do banco

### Coexistencia com F36

F36 ja preparou a UI e a persistencia. Esta feature apenas remove a segunda opcao (override) que se tornou desnecessaria.

## Aceitacao

- [ ] Remover todas as referencias textuais e de codigo a "OVERRIDE PONTUAL", "override pontual", override *
- [ ] Verificar que nenhum teste menciona flags de override (`--tool`, `--model`, `--effort`)
- [ ] Web UI nao renderiza nenhuma secao de override
- [ ] Abrir feature detail, editar parametros, clicar "Save Config" → valores persistem corretamente
- [ ] Iniciar feature sem override manual → usa config persistida do banco
- [ ] `msq run --help` nao lista `--tool`, `--model`, `--effort`
- [ ] Typecheck passa (`npm run typecheck`)
- [ ] Build passa (`npm run build`)
- [ ] Testes passam (`npm test`)
- [ ] Documentacao (F34, F36, README) reflete a mudanca
