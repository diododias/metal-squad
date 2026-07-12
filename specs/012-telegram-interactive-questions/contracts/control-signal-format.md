# Contrato: Formato de saida da IA para pergunta com opcoes discretas

Este e o contrato mais critico da feature: e a interface entre o output de
texto livre de qualquer adapter (`claude`, `codex`, `opencode`) e o parser
em `src/core/adapters/control.ts`. Se este contrato nao for seguido pelo
prompt/skill do stage, o sistema cai no fallback de texto livre — que e o
comportamento correto e esperado (FR-007), nao uma falha.

## Gramatica

```
MSQ_INPUT_REQUIRED: <texto da pergunta, uma ou mais linhas>
OPTIONS:
- <rotulo da opcao 1>
- <rotulo da opcao 2>
- <rotulo da opcao 3>
```

- O prefixo `MSQ_INPUT_REQUIRED:` deve ser a ULTIMA ocorrencia no output
  (comportamento ja existente, inalterado — `parseControlSignal` usa
  `lastIndexOf`).
- A linha `OPTIONS:` (case-insensitive, sem conteudo apos os dois-pontos
  na mesma linha) marca o inicio do bloco de opcoes. Tudo antes dela,
  apos o prefixo, e o texto da pergunta.
- Cada linha do bloco de opcoes que comeca com `-` (hifen + espaco) e uma
  opcao. Linhas vazias entre opcoes sao ignoradas. Qualquer linha que nao
  comece com `-` encerra o bloco de opcoes (o parser para de coletar).
- Sem o marcador `OPTIONS:`, o comportamento e identico ao existente hoje:
  `prompt` = texto integral apos `MSQ_INPUT_REQUIRED:`, sem `options`.

## Validacao / fallback (aplicada pelo parser, nao pela IA)

| Condicao invalida | Resultado |
|---|---|
| Nenhuma linha `-` apos `OPTIONS:` | `options` ausente; `prompt` = texto integral original (incluindo o `OPTIONS:` cru) |
| Mais de 8 opcoes | `options` ausente; mesmo fallback acima |
| Algum rotulo de opcao vazio ou > 60 caracteres | `options` ausente; mesmo fallback acima |
| Rotulos de opcao duplicados (exatos) | `options` ausente; mesmo fallback acima |
| Bloco valido (1-8 opcoes, cada uma 1-60 chars, sem duplicata) | `prompt` = so o texto da pergunta (sem o bloco `OPTIONS:`); `options` = array de rotulos, na ordem apresentada |

## Exemplo — entrada valida

Output bruto do adapter (stdout/stream do CLI da IA):

```
Analisei a spec e preciso de uma decisao antes de continuar.

MSQ_INPUT_REQUIRED: Qual estrategia de cache devemos usar para esta feature?
OPTIONS:
- Cache em memoria (mais simples, perdido em restart)
- Cache em SQLite (persistente, reaproveita infra atual)
- Sem cache por enquanto (adiar decisao)
```

Resultado de `parseControlSignal`:

```ts
{
  type: 'needs_input',
  prompt: 'Qual estrategia de cache devemos usar para esta feature?',
  options: [
    'Cache em memoria (mais simples, perdido em restart)',
    'Cache em SQLite (persistente, reaproveita infra atual)',
    'Sem cache por enquanto (adiar decisao)',
  ],
}
```

## Exemplo — fallback (sem opcoes discretas)

```
MSQ_INPUT_REQUIRED: Como devemos nomear esta entidade no dominio?
```

Resultado:

```ts
{
  type: 'needs_input',
  prompt: 'Como devemos nomear esta entidade no dominio?',
}
```

(sem `options` — Telegram usa o formato de texto livre existente, sem
botoes; consistente com a Assumption da spec de que perguntas abertas
continuam em texto livre.)
