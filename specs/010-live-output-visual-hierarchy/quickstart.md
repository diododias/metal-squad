# Quickstart: Validar Live Output — Hierarquia Visual e Cores Mutadas

Sem contratos de API/CLI para esta feature — a mudanca e presentacional,
contida em `src/web/static/styles.css` e
`src/web/static/components/RunDetail.js` (ver [data-model.md](./data-model.md)
para o mapeamento `entry.source` → tratamento visual).

## Pre-requisitos

- Build atualizado do `msq`: `rtk npm run build`
- Um banco com pelo menos uma run que tenha entries `tool`, heartbeat e,
  idealmente, `stderr` no Live Output (uma run real recente serve; nao e
  necessario criar fixture nova so para isto)

## Passos

1. Suba o dashboard web local:

   ```bash
   rtk node dist/index.js ui
   ```

   (ou o comando equivalente ja documentado no `README.md` para abrir a UI
   web, se o comando `ui` expuser um alias/porta especifico)

2. Abra o detalhe de uma run que tenha narrativa e tool calls intercalados.

3. Confirme visualmente, comparando com o estado anterior (`git stash` /
   branch `develop` se precisar do "antes"):
   - **SC-001**: a narrativa do agente e o elemento mais proeminente da tela.
   - **SC-002**: nenhuma entry `tool` ocupa a largura total do container do
     log, mesmo com texto longo (ex.: comando de shell extenso) ou muito
     curto (um unico token).
   - **SC-003**: o contraste da entry `tool` fica comparavel ao da entry
     `heartbeat` (mesma familia de cor `--muted`).
   - **SC-004**: narrativa e `stderr` mantem o mesmo contraste de antes
     (sem regressao de legibilidade/alerta).

4. Confirme a distincao semantica (User Story 2 / FR-006): com narrativa,
   tool, heartbeat e stderr juntos no painel, cada tipo continua
   identificavel — a entry `tool` deve manter um indicador/prefixo
   reconhecivel mesmo apagada (mesmo padrao ja usado por `ERR>` em stderr).

5. Redimensione a janela do navegador para uma largura estreita e repita a
   checagem de FR-001/FR-003/FR-004 (edge case de tela estreita).

6. Confirme que nada mudou no streaming: os eventos continuam chegando ao
   vivo, o auto-scroll/pause (Ctrl+S) continua funcionando, e o conteudo
   textual das linhas e identico ao anterior (FR-007).

## Fora de escopo — nao validar aqui

- TUI (`src/ui/`, `msq run`/`msq status` no terminal) — permanece inalterada
  (FR-008); qualquer diferenca visual la e um bug de escopo, nao desta
  feature.
