# Harness Rules

## Quando estas regras importam

Use estas regras sempre que a tarefa envolver:

- `msq run`, `msq status`, `msq ui` ou `node dist/index.js`
- validacao de adapters
- backlog temporario para exercitar o produto
- observabilidade, timeout, heartbeat, recursao ou SQLite

## Banco local gravavel

`msq` grava por padrao em um banco global unico (`~/.local/share/metal-squad/app.db`, XDG-style, definido em `src/config/index.ts`). Runs reais de features devem usar esse caminho default, sem override — e assim que o historico de conclusao de features (usado para "Ready to start" na TUI) se acumula em um unico lugar consultavel.

`MSQ_DB_PATH` e um override reservado para sessoes de harness sandboxadas onde o caminho global genuinamente nao e gravavel (ex.: `attempt to write a readonly database`, ver `docs/hotfixes/H03-run-readonly-db-path.md`). So use-o depois de confirmar que o banco global falhou:

```bash
MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js run --feature feat-XX
```

O mesmo vale para `status`:

```bash
MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js status --limit 5
```

Nao use esse override como padrao para desenvolvimento real de features — isso fragmenta o historico de runs por worktree e faz features ja concluidas reaparecerem como pendentes quando a TUI le o banco global.

## Anti-recursao

Dentro de uma sessao ja spawnada pelo `msq`, e proibido:

- rodar `msq run`
- rodar `node dist/index.js run`
- rodar `npm run dev -- run ...`
- disparar qualquer nested runner que reinicie o proprio orquestrador

Se o objetivo e testar o `msq`, isso deve acontecer no harness externo, nao de dentro do agente filho.

## Evidencias minimas de run real

Nao considere o fluxo bem-sucedido so porque o processo saiu com `0`. Exija pelo menos dois sinais concretos, idealmente tres:

- nova run persistida em `status`/SQLite
- output util do adapter, heartbeat ou summary parcial/final
- diff, commit ou arquivos tocados no checkout

Sem isso, trate como falha operacional do produto ou do harness.

## Testes de UI (Ink / React)

Os testes em `tests/ui/` **nao usam render de DOM real** nem `@testing-library/react`. As convencoes sao:

### Componentes (`tests/ui/components.test.ts`)

Chame a funcao do componente diretamente e verifique o retorno com `React.isValidElement`:

```ts
const element = EmptyState();
expect(React.isValidElement(element)).toBe(true);
```

Para verificar props de filhos, use o helper `findElement` (definido em `app.test.ts`) para percorrer a arvore JSX retornada.

### App / input handlers (`tests/ui/app.test.ts`)

- Use `vi.mock` no nivel do modulo (hoistado pelo Vitest) para todos os mocks.
- Mock do `useState` via indice de chamada com a variavel `useStateCallIndex`:

```ts
useState: vi.fn((initialValue) => {
  const callIndex = useStateCallIndex++;
  if (callIndex === 0) return [stateValue, setUi];
  if (callIndex === 1) return [helpOpenValue, setHelpOpen];
  ...
})
```

- Resete `useStateCallIndex = 0` e `vi.clearAllMocks()` no `beforeEach`.
- Extraia o handler de teclado de `useInput` assim:

```ts
const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
handler('j', {});
handler('', { tab: true });
```

- Para verificar transicoes de estado, extraia o updater do `setUi.mock.calls` e aplique-o sobre `stateValue`:

```ts
const cycleFocus = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
expect(cycleFocus(stateValue).focusPanel).toBe('gates');
```

### Hooks (`tests/ui/hooks.test.ts`)

- Use `vi.doMock` (nao `vi.mock`) dentro de cada `it`, seguido de `await import(...)` dinamico.
- Chame `vi.resetModules()` no `afterEach` para evitar vazamento de modulo entre testes.
- Mock de `useEffect` executa o efeito de forma sincrona: `useEffect: (effect) => effect()`.
- Listeners de eventos capturados via `Map` local e chamados diretamente para simular eventos:

```ts
const listeners = new Map<string, Array<() => void>>();
// ... mock do eventBus ...
listeners.get('run:start')?.[0]?.();
```

### Testes de render de terminal (`tests/ui/render.test.tsx`)

Para verificar o texto que o usuario **realmente ve no terminal**, use `ink-testing-library`:

```ts
import { render, cleanup } from 'ink-testing-library';
import React from 'react';

afterEach(() => cleanup());

it('renders idle state', () => {
  const { lastFrame } = render(<StatusBar {...props} />);
  expect(lastFrame()).toContain('Idle');
});
```

- `lastFrame()` retorna o frame ASCII atual do terminal virtual (80x24 por padrao).
- Prefira `toContain` em vez de `toBe` para evitar fragilidade com padding/cores ANSI.
- **Limitacao conhecida**: componentes que usam `position="absolute"` (e.g. `CommandPalette`) nao aparecem no frame virtual do ink-testing-library. Teste esses via mock em `app.test.ts`.
- O arquivo e `.tsx` — o Vitest compila JSX via esbuild automaticamente.

### Suite de UI focada

```bash
rtk npx vitest run tests/ui/app.test.ts tests/ui/components.test.ts tests/ui/hooks.test.ts tests/ui/format.test.ts tests/ui/render.test.tsx
```

### O que nao fazer

- Nao use `render()` do `@testing-library/react` — os componentes sao Ink, nao DOM.
- Nao teste via `msq ui` live para validar logica de componente; use a suite focada.
- Nao adicione mocks globais de modulo fora de `vi.mock`/`vi.doMock` — eles nao sao limpos automaticamente.
- Nao tente verificar texto de componentes com `position="absolute"` via `lastFrame()` — o resultado sera string vazia; use o padrao de mock do `app.test.ts` nesses casos.

## Escolha da skill correta

- desenvolvimento normal do repo: `.claude/skills/dev-flow/SKILL.md`
- validacao do proprio executor/harness: `.claude/skills/msq-develop/SKILL.md`

## Quando registrar docs operacionais

Se a validacao revelar defeito real do produto:

- registre em `docs/hotfixes/Hxx-*.md` quando for bug operacional/correcao
- registre em `docs/features/F25-*.md` ou outra feature operacional quando for melhoria estrutural do harness

Nao compense falha do harness implementando manualmente a feature alvo e chamando isso de validacao do `msq`.
