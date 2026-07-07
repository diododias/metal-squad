# Research: TUI Interativa — Painel de Runs, Tokens e Gates

## ink Polling Pattern

**Decision**: `useEffect` + `setInterval` + `useState` para refresh periódico.

**Rationale**: O padrão canônico do ink para dados mutáveis é criar um hook customizado
que inicia um interval no `useEffect`, lê o DB a cada tick e atualiza o estado via
`useState`. O ink re-renderiza automaticamente em cada atualização de estado.
`better-sqlite3` é síncrono, então a leitura cabe diretamente no callback do interval
sem necessidade de `async/await` ou `useCallback` complexo.

**Alternatives considered**:
- File-based IPC (watch a log file): rejeitado — acoplamento desnecessário, a DB
  já é o estado canônico.
- SQLite `on_change` callbacks: não suportado pelo driver `better-sqlite3`.
- Interval no componente raiz vs. hook dedicado: hook dedicado preferido para
  separação de concerns e testabilidade.

```ts
// Padrão aprovado para useRuns.ts
function useRuns(intervalMs = 2000) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  useEffect(() => {
    const tick = () => setRuns(listRuns(50));
    tick(); // load imediato
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return runs;
}
```

---

## SQLite Reads em Ink (better-sqlite3)

**Decision**: Leituras síncronas diretamente nos callbacks de interval; conexão DB
aberta via lazy singleton (`getDb()`).

**Rationale**: `better-sqlite3` é bloqueante mas extremamente rápido em leituras
locais (< 1ms tipicamente). Em um intervalo de 2s o overhead é insignificante.
O singleton em `src/db/index.ts` garante que só há uma conexão aberta.

**Constraint**: Não abrir conexão extra no processo TUI se `msq run` estiver
usando a mesma DB. WAL mode (já configurado) resolve conflitos de leitura/escrita
simultânea sem bloqueio perceptível.

---

## Keyboard Handling em Ink

**Decision**: `useInput` hook do ink com teclas simples de 1 caractere.

**Rationale**: ink expõe `useInput((input, key) => {...})` que captura stdin em raw
mode. Para o TUI do metal-squad, teclas sem modificador são suficientes e intuitivas:

| Tecla | Ação |
|-------|------|
| `a`   | Aprovar gate selecionado |
| `s`   | Pular (skip) gate selecionado |
| `r`   | Retentar gate selecionado |
| `↑/↓` | Navegar entre gates bloqueados |
| `q`   | Sair do TUI |

`useInput` não interfere com o interval de polling — ambos coexistem normalmente.

---

## Layout Responsivo em Ink

**Decision**: Checar `process.stdout.columns` no render via `useStdout` e alternar
entre layout completo (≥ 60 cols) e layout compacto (< 60 cols).

**Rationale**: ink fornece `useStdout` que retorna `{ stdout }` com `stdout.columns`.
O layout completo mostra: feature_id | tool | status | duração | tokens.
O layout compacto mostra: feature_id | status (colunas secundárias ocultadas).

**Alternatives considered**:
- Usar `Box` com `flexWrap: "wrap"`: mal suportado em versões recentes do ink
  para tabelas com largura fixa.
- Truncar células: pode esconder informação crítica (status).
- Decisão: toggle de modo full/compact baseado em threshold de colunas.

---

## Design de Gates

**Decision**: Tabela `gates` separada; `runs.status` pode ter valor `'blocked'`.

**Rationale**: A tabela `runs` é um registro imutável de execuções — não deve ter
status revertido (ex: `done → todo`). A tabela `gates` é um registro de decisões
humanas sobre runs bloqueados. Isso mantém a auditoria limpa:
- `runs`: histórico de execuções (append-only)
- `gates`: decisões sobre runs que precisaram de intervenção humana

```sql
CREATE TABLE IF NOT EXISTS gates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL REFERENCES runs(id),
  feature_id  TEXT NOT NULL,
  repo_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,           -- NULL = open gate
  decision    TEXT            -- 'approved' | 'skipped' | 'retried'
);
```

**Como um gate é criado**: O `execute.ts` (ou o adapter) finaliza um run com
`finishRun(runId, 'blocked')` e chama `createGate(runId, featureId, repoId)`.
A implementação de "quando criar um gate" é deixada para o adapter — fora do escopo
desta feature; o TUI apenas lê e resolve gates existentes.

**Gate approval flow no TUI**:
1. Usuário pressiona `a` numa feature blocked → `resolveGate(gateId, 'approved')`
2. Isso apenas registra a decisão no DB — não inicia nova execução
3. Na próxima chamada de `msq run`, o executor verifica gates aprovados e decide
   re-executar (fora do escopo desta feature; será tratado quando o gate creation
   for implementado)

**Alternatives considered**:
- Status field reversal (`runs.status = 'todo'`): viola imutabilidade de run history.
- feature_status table: mais complexo; gates table é mais específica e auditável.
- In-memory gate tracking no TUI: não persiste entre sessões.
