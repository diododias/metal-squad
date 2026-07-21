#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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

// --- Épico Projetos: links in ROADMAP.md must resolve to real files ---

const projectsRoadmapPath = 'docs/epics/epico - projetos/ROADMAP.md';
const projectsRoadmapAbs = resolve(repoRoot, projectsRoadmapPath);
const projectsRoadmapDir = dirname(projectsRoadmapAbs);
const projectsRoadmapContent = readFileSync(projectsRoadmapAbs, 'utf8');

const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
let match;
while ((match = linkPattern.exec(projectsRoadmapContent)) !== null) {
  const target = match[1];
  if (/^https?:\/\//.test(target)) continue;
  const [pathPart] = target.split('#');
  if (!pathPart) continue;
  const decodedPath = decodeURIComponent(pathPart);
  const resolvedPath = resolve(projectsRoadmapDir, decodedPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Broken link in ${projectsRoadmapPath}: "${target}" does not resolve to ${resolvedPath}`);
  }
}

// --- Forbidden/obsolete terminology in canonical docs (ADR-001 vocabulary) ---

const canonicalDocs = [
  'README.md',
  '.claude/rules/repo-context.md',
  '.claude/rules/architecture.md',
  '.claude/rules/git-workflow.md',
  '.claude/rules/testing.md',
  '.claude/rules/harness.md',
  'docs/adr/ADR-001-governanca-fonte-de-verdade-terminologia.md',
  projectsRoadmapPath,
];

// Each forbidden term may appear only inside an explicit compatibility/legacy
// note. `allow` lines are substrings that, if present anywhere in the same
// line as the match, mark that occurrence as an allowed compatibility
// mention instead of a violation.
const forbiddenTerms = [
  { term: 'Project defaults', allow: ['legad', 'legacy', 'compat', 'alias', 'não são nomes', 'nao sao nomes'] },
  { term: 'DemandSchema', allow: [] },
  { term: 'BacklogItemSchema', allow: [] },
  { term: '/Users/', allow: [] },
  { term: 'iCloud~md~obsidian', allow: [] },
];

for (const docPath of canonicalDocs) {
  const absPath = resolve(repoRoot, docPath);
  if (!existsSync(absPath)) continue;
  const content = readFileSync(absPath, 'utf8');
  const lines = content.split('\n');
  for (const { term, allow } of forbiddenTerms) {
    lines.forEach((line, index) => {
      if (!line.includes(term)) return;
      const isAllowed = allow.some((marker) => line.toLowerCase().includes(marker.toLowerCase()));
      if (!isAllowed) {
        throw new Error(
          `Forbidden/obsolete term "${term}" found in ${docPath}:${String(index + 1)} without a compatibility note: ${line.trim()}`,
        );
      }
    });
  }
}

console.log('[verify-doc-references] stale references not found');
