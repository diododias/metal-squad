#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);

const expectedFiles = new Map([
  [
    '.agents/skills/dev-flow/SKILL.md',
    `---
name: "dev-flow"
description: "Fluxo de desenvolvimento padrão: do worktree ao PR aberto."
---

# Skill: Fluxo de desenvolvimento

Esta copia em \`.agents/skills/dev-flow/\` existe apenas por compatibilidade com discovery legado.

## Fonte de verdade obrigatoria

Carregue e siga a skill canonica em:

- [\`../../../.claude/skills/dev-flow/SKILL.md\`](../../../.claude/skills/dev-flow/SKILL.md)

Use tambem:

- template de PR: [\`../../../.claude/skills/dev-flow/pr-template.md\`](../../../.claude/skills/dev-flow/pr-template.md)
- regras do repo: [\`../../../.claude/rules/README.md\`](../../../.claude/rules/README.md)

## Regra de manutencao

Nao mantenha logica propria aqui. Se esta copia divergir da \`.claude\`, a \`.claude\` vence.
`,
  ],
  [
    '.agents/skills/dev-flow/pr-template.md',
    'Use a versao canonica em `../../../.claude/skills/dev-flow/pr-template.md`.\n',
  ],
  [
    '.agents/skills/msq-develop/SKILL.md',
    `---
name: "msq-develop"
description: "Atua como QA do executor \`msq\`: seleciona a proxima feature, recompila o projeto imediatamente antes da execucao, roda \`msq run\` e valida se a ferramenta realmente implementou a feature sozinha. Nao implementa manualmente a feature alvo. Use quando for preciso testar o fluxo real do \`msq\`, validar evidencias, registrar bugs em \`docs/hotfixes\` e abrir PR apenas se o executor concluir com sucesso."
---

Esta copia em \`.agents/skills/msq-develop/\` existe apenas por compatibilidade com discovery legado.

## Fonte de verdade obrigatoria

Carregue e siga a skill canonica em:

- [\`../../../.claude/skills/msq-develop/SKILL.md\`](../../../.claude/skills/msq-develop/SKILL.md)

Use tambem:

- regras do repo: [\`../../../.claude/rules/README.md\`](../../../.claude/rules/README.md)

## Regra de manutencao

Nao mantenha logica propria aqui. Se esta copia divergir da \`.claude\`, a \`.claude\` vence.
`,
  ],
]);

for (const [relativePath, expected] of expectedFiles) {
  const actual = readFileSync(resolve(repoRoot, relativePath), 'utf8');
  if (actual !== expected) {
    throw new Error(`Shim drift detected: ${relativePath}`);
  }
}

console.log('[verify-skill-shims] compatibility shims match canonical expectations');
