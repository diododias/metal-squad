#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const backlogModulePath = resolve(repoRoot, 'dist/core/backlog/load.js');
const skillsModulePath = resolve(repoRoot, 'dist/core/skills/index.js');

if (!existsSync(backlogModulePath) || !existsSync(skillsModulePath)) {
  throw new Error('Build output missing. Run `npm run build` before `verify:backlog`.');
}

const { loadBacklog } = await import(`file://${backlogModulePath}`);
const { collectBacklogSkillNames, validateBacklogSkills } = await import(`file://${skillsModulePath}`);

const primaryBacklogPath = resolve(repoRoot, 'backlog.yaml');
const exampleBacklogPath = resolve(repoRoot, 'backlog.example.yaml');
const primaryBacklogRaw = existsSync(primaryBacklogPath) ? readFileSync(primaryBacklogPath, 'utf8').trim() : '';
const backlogPath = primaryBacklogRaw.length > 0 ? primaryBacklogPath : exampleBacklogPath;

if (backlogPath === exampleBacklogPath) {
  console.log('[verify-backlog] backlog.yaml vazio; validando backlog.example.yaml');
}

const backlog = loadBacklog(backlogPath, repoRoot);
validateBacklogSkills(backlog, repoRoot);

console.log('[verify-backlog] backlog.yaml and skill references are valid');
