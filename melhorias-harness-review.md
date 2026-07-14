
## P0.1 — Atualizar referencias para a nova fonte de verdade

**Problema:** Git, backlog, rules e vault discordam.  
**Decisao do stakeholder:** novas specs serao disponibilizadas; nao restaurar o material antigo.  
**Acao recomendada atualizada:** remover das rules, skills e demais instrucoes todas as referencias a specs/hotfixes antigos. Quando as novas specs forem disponibilizadas, atualizar o backlog e as referencias para apontarem somente para esse novo conjunto versionado. Nao usar caminho absoluto do vault no backlog.

## P0.2 — Separar custo acumulado de ocupacao da janela

**Problema:** `total_tokens` e `context_window_percent` misturam conceitos diferentes.  
**Acao recomendada:** definir um contrato normalizado por provider:

- `input_tokens_total` — consumo acumulado reportado;
- `cached_input_tokens` — subconjunto/cache, sem somar duas vezes ao total quando o provider ja o inclui;
- `output_tokens` e `reasoning_tokens` separados;
- `lifetime_tokens` — custo acumulado da run/sessao;
- `current_context_tokens` — ocupacao da janela no ultimo turno/snapshot;
- `context_window_tokens` — capacidade efetiva do modelo;
- `context_window_percent` — apenas `current_context_tokens / context_window_tokens`, limitado a 0..100;
- `usage_semantics_version` — permite migrar historico sem fingir comparabilidade.

O adapter deve informar a semantica; DB/stats nao devem tentar inferi-la de um total generico. A decisao de reuso de sessao deve usar apenas um snapshot confiavel da sessao atual. Quando indisponivel, escolher politica conservadora e marcar `reliable=false`.

**Gates:** nenhum percentual >100; invariantes por provider; fixtures reais de eventos Claude/Codex/OpenCode; migration test; session-policy test usando snapshots por turno.

## P0.3 — Tornar Husky a autoridade dos gates

**Problema:** nao existe workflow CI versionado; hooks locais nao protegem PRs e coverage ja falha.  
**Decisao do stakeholder:** nao usar GitHub Actions por falta de creditos. O gate deve rodar localmente via Husky.  
**Acao recomendada atualizada:** configurar Husky como gate obrigatorio antes de commit/push, incluindo:

1. `npm ci` em Node suportado;
2. build;
3. typecheck;
4. lint;
5. unit/integration tests;
6. coverage corrigida;
7. validacao de backlog/refs/skills/Spec Kit;
8. smoke test do binario `dist/index.js`;
9. auditoria de warnings inesperados.

O gate de coverage deve ser bloqueante e exigir resultado **acima de 90%**. Separar coverage de codigo ativo e legado. Configs de build nao devem derrubar a metrica de `src/`; a TUI aposentada deve ter gate legado separado. A UI web oficial deve receber threshold progressivo por diff ate atingir o baseline global.

## P0.4 — Unificar skills e contratos dos agentes

**Problema:** fonte canonica declarada e copia mais atual nao coincidem.  
**Acao recomendada:** uma unica fonte geradora em `.claude/`, com `.agents/` como shim pequeno ou artefato gerado. Adicionar teste que compara hashes/conteudo permitido. Corrigir todas as referencias de docs. O `msq-develop` canonico deve ser inequivocamente QA-only.

## P1.1 — Integrar Dora/Serena ao caminho critico, com prova de uso

**Decisao do stakeholder:** garantir que OpenCode, Codex e Claude Code usem Serena e Dora.

- Atualizar Dora automaticamente quando `HEAD` ou hash dos arquivos indexados mudar.
- Salvar no indice o commit/hash de origem e recusar consultas stale por default.
- Criar `mem:core` no Serena com apenas invariantes duraveis: mapa de camadas, fontes de verdade, comandos, perigos e links para memorias especificas.
- Incluir nas instrucoes dos agentes: Dora para estrutura/impacto; Serena para simbolos/edicoes/memoria; leitura bruta apenas depois.
- Resolver Dora `Pending approval` no Claude headless e a ausencia no OpenCode.
- Emitir eventos `context:query` com ferramenta, bytes retornados, latencia e cache hit.
- Medir por run a proporcao `Dora/Serena queries : shell reads`. Meta inicial: pelo menos 70% das exploracoes estruturais via indice/simbolos.

## P2.1 — Mutation testing orientado por risco

- Corrigir primeiro sobreviventes em `execute.ts`, `repo.ts` e adapters.
- Aumentar threshold apenas apos remover `NoCoverage` estrutural.
- Adicionar `src/config`, `src/security`, comandos criticos e backend web ao escopo.
- Para React, priorizar component/E2E e mutar apenas logica util; nao perseguir score artificial em markup.
- Publicar JSON do Stryker, tendencia por commit e lista de sobreviventes novos, nao apenas HTML.