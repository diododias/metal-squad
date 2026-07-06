import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { parse } from 'yaml';
import {
  BacklogSchema,
  type BacklogV1,
  type BacklogV2,
  type Defaults,
} from './schema.js';

export const BACKLOG_FILE = 'backlog.yaml';

function normalizeV1(backlog: BacklogV1): BacklogV2 {
  const defaults: Defaults = { tool: 'claude', effort: 'medium', skills: ['implement'] };
  return {
    version: 2,
    repo: backlog.repo,
    defaults,
    epics: backlog.epics.map((epic) => ({
      ...epic,
      features: epic.features.map((feature) => ({
        ...feature,
        skills: feature.skills ?? defaults.skills,
        tasks: feature.tasks.map((task) => ({
          ...task,
          skills: task.skills ?? defaults.skills,
        })),
      })),
    })),
  };
}

function propagateDefaults(backlog: BacklogV2): BacklogV2 {
  const { defaults } = backlog;
  return {
    ...backlog,
    epics: backlog.epics.map((epic) => ({
      ...epic,
      features: epic.features.map((feature) => ({
        ...feature,
        skills: feature.skills ?? defaults.skills,
        tasks: feature.tasks.map((task) => ({
          ...task,
          skills: task.skills ?? defaults.skills,
        })),
      })),
    })),
  };
}

function validateFiles(backlog: BacklogV2, root: string): void {
  for (const epic of backlog.epics) {
    for (const feature of epic.features) {
      if (feature.specFile) {
        const abs = resolve(root, feature.specFile);
        if (!existsSync(abs)) {
          throw new Error(`specFile not found: ${feature.specFile} (resolved: ${abs})`);
        }
      }
      for (const task of feature.tasks) {
        if (task.taskFile) {
          const abs = resolve(root, task.taskFile);
          if (!existsSync(abs)) {
            throw new Error(`taskFile not found: ${task.taskFile} (resolved: ${abs})`);
          }
        }
      }
    }
  }
}

export function loadBacklog(path = BACKLOG_FILE, cwd = process.cwd()): BacklogV2 {
  const absPath = isAbsolute(path) ? path : resolve(cwd, path);
  const root = dirname(absPath);
  const raw = readFileSync(absPath, 'utf8');
  const parsed = BacklogSchema.parse(parse(raw));

  let v2: BacklogV2;
  if (parsed.version === 1) {
    console.warn(
      '[msq] backlog.yaml está em formato v1 — considere atualizar para version: 2',
    );
    v2 = normalizeV1(parsed);
  } else {
    v2 = propagateDefaults(parsed);
  }

  validateFiles(v2, root);
  return v2;
}
