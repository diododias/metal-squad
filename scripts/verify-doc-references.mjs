#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);

const checks = [
  {
    path: '.claude/rules/repo-context.md',
    forbidden: [
      '/Users/luizdiodo/Library/Mobile Documents/iCloud~md~obsidian/Documents/default/metal-squad/project/docs/ROADMAP.md',
      'o roadmap real esta no vault Obsidian',
    ],
  },
  {
    path: 'docs/epics/epic - one/ROADMAP.md',
    forbidden: [
      '/Users/luizdiodo/Library/Mobile Documents/iCloud~md~obsidian/Documents/default/metal-squad/project/docs/ROADMAP.md',
      '/Users/luizdiodo/Library/Mobile Documents/iCloud~md~obsidian/Documents/default/metal-squad/project/docs/HISTORICO.md',
      'O roadmap vivo (proximos passos, prioridades, backlog) e o historico de',
    ],
  },
];

for (const check of checks) {
  const content = readFileSync(resolve(repoRoot, check.path), 'utf8');
  for (const token of check.forbidden) {
    if (content.includes(token)) {
      throw new Error(`Forbidden stale reference found in ${check.path}: ${token}`);
    }
  }
}

console.log('[verify-doc-references] stale references not found');
