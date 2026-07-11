import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { parse } from 'yaml';
import {
  BacklogSchema,
  BacklogV2Schema,
  type BacklogV1,
  type BacklogV2,
  type Defaults,
  type Epic,
  type Feature,
} from './schema.js';
import { getCatalogMeta, listCatalogEpics, listCatalogFeatures } from '../../db/backlogCatalog.js';

export const BACKLOG_FILE = 'backlog.yaml';

type RawYamlMap = Record<string, unknown>;

function normalizeV1(backlog: BacklogV1): BacklogV2 {
  const defaults: Defaults = { tool: 'claude', effort: 'medium', skills: [], stageSkills: {} };
  return {
    version: 2,
    repo: backlog.repo,
    defaults,
    ...(backlog.budget ? { budget: backlog.budget } : {}),
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

function applyDefaultsBeforeParse(raw: unknown): unknown {
  if (!isRecord(raw) || raw.version !== 2) return raw;

  const defaults = isRecord(raw.defaults) ? raw.defaults : {};
  const defaultTool = typeof defaults.tool === 'string' ? defaults.tool : undefined;
  const defaultEffort = typeof defaults.effort === 'string' ? defaults.effort : undefined;
  const defaultSkills: unknown[] | undefined = Array.isArray(defaults.skills) ? defaults.skills : undefined;
  const epics = Array.isArray(raw.epics) ? raw.epics : [];

  return {
    ...raw,
    epics: epics.map((epic): unknown => {
      if (!isRecord(epic)) return epic;
      const features: unknown[] = Array.isArray(epic.features) ? epic.features : [];
      return {
        ...epic,
        features: features.map((feature) => {
          if (!isRecord(feature)) return feature;
          const tasks: unknown[] = Array.isArray(feature.tasks) ? feature.tasks : [];
          return {
            ...feature,
            ...(feature.tool === undefined && defaultTool ? { tool: defaultTool } : {}),
            ...(feature.effort === undefined && defaultEffort ? { effort: defaultEffort } : {}),
            ...(feature.skills === undefined && defaultSkills ? { skills: [...defaultSkills] } : {}),
            tasks: tasks.map((task) => {
              if (!isRecord(task)) return task;
              return {
                ...task,
                ...(task.skills === undefined && defaultSkills ? { skills: [...defaultSkills] } : {}),
              };
            }),
          };
        }),
      };
    }),
  };
}

function isRecord(value: unknown): value is RawYamlMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadBacklog(path = BACKLOG_FILE, cwd = process.cwd()): BacklogV2 {
  const absPath = isAbsolute(path) ? path : resolve(cwd, path);
  const root = dirname(absPath);
  const raw = readFileSync(absPath, 'utf8');
  const parsed = BacklogSchema.parse(applyDefaultsBeforeParse(parse(raw)));

  let v2: BacklogV2;
  if (parsed.version === 1) {
    console.warn('[msq] backlog.yaml is in v1 format — consider upgrading to version: 2');
    v2 = normalizeV1(parsed);
  } else {
    v2 = propagateDefaults(parsed);
  }

  validateFiles(v2, root);
  return v2;
}

/**
 * Reconstructs a fully-validated Backlog from the DB catalog tables
 * (populated by `msq backlog load`), instead of reading backlog.yaml.
 * This is the runtime source of truth after F35 — see docs/features/F35-backlog-catalog-import.md.
 */
export function loadBacklogFromCatalog(repoId: string): BacklogV2 {
  const meta = getCatalogMeta(repoId);
  const epicRows = listCatalogEpics(repoId);

  if (!meta || epicRows.length === 0) {
    throw new Error(
      `Catalogo vazio para este repo — rode "msq backlog load" primeiro.`,
    );
  }

  const featureRows = listCatalogFeatures(repoId);
  const featuresByEpic = new Map<string, Feature[]>();
  for (const row of featureRows) {
    const feature = JSON.parse(row.data_json) as Feature;
    const bucket = featuresByEpic.get(row.epic_id) ?? [];
    bucket.push(feature);
    featuresByEpic.set(row.epic_id, bucket);
  }

  const epics: Epic[] = epicRows.map((row) => {
    const epic = JSON.parse(row.data_json) as Epic;
    return { ...epic, features: featuresByEpic.get(row.epic_id) ?? [] };
  });

  const raw = {
    version: 2 as const,
    repo: meta.repo,
    defaults: JSON.parse(meta.defaults_json) as Defaults,
    ...(meta.budget_json ? { budget: JSON.parse(meta.budget_json) as unknown } : {}),
    epics,
  };

  return BacklogV2Schema.parse(raw);
}
