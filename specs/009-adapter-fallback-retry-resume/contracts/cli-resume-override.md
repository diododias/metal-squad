# Contrato: `msq resume <target> --tool --model --effort`

Extensao de `src/commands/resume.ts`.

## Assinatura

```text
msq resume <target> [--concurrency <n>] [--tool <claude|codex|opencode>] [--model <string>] [--effort <low|medium|high>]
```

- `<target>`: inalterado — run-id, feature-id ou repo-id (via `findResumablePipeline`).
- `--tool`, `--model`, `--effort`: **novos**, todos opcionais e independentes entre si (pode informar so `--model` mantendo o `tool` persistido, por exemplo).

## Comportamento

1. Sem nenhuma das novas flags ⇒ comportamento identico ao atual (nenhuma regressao).
2. Com `--tool` e/ou `--model`/`--effort` ⇒:
   - Resolve a feature-alvo dentro do pipeline retomavel (a que estava `active`/bloqueada/em gate no snapshot).
   - **Antes** de criar qualquer run ou chamar `executeBacklog`, valida que `--tool` (se informado) existe no registry (`getAdapter`) e esta disponivel no ambiente atual (binario/credencial). Se invalido/indisponivel: aborta com mensagem clara, sem alterar estado de pipeline/run (FR-012).
   - Aplica o override apenas como candidato inicial da proxima tentativa **daquela feature** — nao propaga para outras features `pending` no mesmo pipeline (FR-007).
   - `backlog.yaml`/catalogo do projeto permanecem inalterados apos o resume (FR-007) — override e por-invocacao do comando, nunca persistido.
3. Se o snapshot resolvido nao tiver nada em `pending`/`active`/`aborted` (pipeline ja totalmente `done`) ⇒ informa "nao ha etapa pendente para reexecutar" e nao chama `executeBacklog` (FR-013).

## Exemplos

```bash
# Resume simples, sem override (comportamento atual)
msq resume feat-01

# Resume trocando so a ferramenta, mantendo model/effort da config persistida
msq resume feat-01 --tool codex

# Resume trocando ferramenta e modelo juntos, so para esta retomada
msq resume feat-01 --tool opencode --model gpt-4o --effort high
```

## Saida esperada (mensagens)

- Sucesso na validacao: reaproveita a mensagem existente de "Retomando pipeline N em <cwd>...", acrescida de uma linha indicando o override ativo quando presente, ex.: `Override pontual: tool=codex (persistido continua claude).`
- Falha de disponibilidade (FR-012): `Ferramenta "X" indisponivel no ambiente atual — resume abortado, nenhuma run criada.`
- Nada pendente (FR-013): `Pipeline N ja concluida — nada para retomar.`

## Casos de erro cobertos por teste

- `--tool` com valor fora do enum `Tool` ⇒ erro de parsing do commander/zod antes de qualquer chamada a DB.
- `--tool` valido no enum mas adapter indisponivel no ambiente (ex.: binario nao instalado) ⇒ erro de negocio, run nao criada, pipeline permanece pausada (nao muda para "running"/"aborting").
- Resume sem flags novas sobre pipeline com gate de budget (`tool='budget'`) ⇒ mesmo mecanismo (D6 em research.md), sem comando dedicado separado.
