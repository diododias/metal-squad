import { readFileSync, existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { parse, stringify } from 'yaml';
import { loadRepoConfig, mergeStageSkills, resolveRuntimeConfig } from '../../config/index.js';
import {
  BacklogInputSchema,
  BacklogV2Schema,
  createRegisteredToolSchema,
  type BacklogV1Input,
  type BacklogV2,
  type BacklogV2Input,
  type Defaults,
  type Epic,
  type Feature,
} from './schema.js';
import type { FeatureRegistrationResult } from './featureId.js';
import { getCatalogMeta, listCatalogEpics, listCatalogFeatures, listOccupiedFeatureIds } from '../../db/backlogCatalog.js';
import { registerBacklogFeatures } from './featureId.js';

export const BACKLOG_FILE = 'backlog.yaml';

type RawYamlMap = Record<string, unknown>;

function normalizeV1(backlog: BacklogV1Input, repoDefaults: ReturnType<typeof loadRepoConfig>['defaults'] = {}): BacklogV2Input {
  const defaults: Defaults = {
    tool: repoDefaults.tool ?? 'claude',
    ...(repoDefaults.model ? { model: repoDefaults.model } : {}),
    effort: repoDefaults.effort ?? 'medium',
    thinking: repoDefaults.thinking ?? 'off',
    skills: repoDefaults.skills ?? [],
    stageSkills: repoDefaults.stageSkills ?? {},
    workflow: {
      mode: 'staged',
      stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
      approvals: { channel: 'telegram' },
      autoAdvance: false,
      syncTasksToBacklog: true,
      sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
      stepGuidance: {},
    },
  };
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

function propagateDefaults(backlog: BacklogV2Input, repoDefaults: ReturnType<typeof loadRepoConfig>['defaults'] = {}): BacklogV2Input {
  const defaults: Defaults = {
    ...backlog.defaults,
    tool: backlog.defaults.tool,
    model: backlog.defaults.model ?? repoDefaults.model,
    effort: backlog.defaults.effort,
    thinking: backlog.defaults.thinking,
    skills: backlog.defaults.skills,
    stageSkills: mergeStageSkills(repoDefaults.stageSkills, backlog.defaults.stageSkills),
    workflow: backlog.defaults.workflow,
    ...(backlog.defaults.maxTokens !== undefined ? { maxTokens: backlog.defaults.maxTokens } : {}),
  };
  return {
    ...backlog,
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

function validateToolReferences(backlog: BacklogV2, cwd: string): void {
  const registeredTool = createRegisteredToolSchema(resolveRuntimeConfig(cwd).tools.map((entry) => entry.id));
  const validate = (tool: string, path: string): void => {
    const result = registeredTool.safeParse(tool);
    if (!result.success) {
      throw new Error(`Invalid ${path}: ${result.error.issues[0]?.message ?? 'unregistered tool.'}`);
    }
  };

  validate(backlog.defaults.tool, 'defaults.tool');
  for (const epic of backlog.epics) {
    for (const feature of epic.features) {
      validate(feature.tool, `feature "${feature.id}".tool`);
      for (const [index, fallback] of feature.retry?.fallback.entries() ?? []) {
        validate(fallback.tool, `feature "${feature.id}".retry.fallback[${String(index)}].tool`);
      }
    }
  }
}

function applyDefaultsBeforeParse(
  raw: unknown,
  repoDefaults: ReturnType<typeof loadRepoConfig>['defaults'] = {},
): unknown {
  if (!isRecord(raw) || raw.version !== 2) return raw;

  const defaults = isRecord(raw.defaults) ? raw.defaults : {};
  const defaultTool = typeof defaults.tool === 'string' ? defaults.tool : repoDefaults.tool;
  const defaultModel = typeof defaults.model === 'string' ? defaults.model : repoDefaults.model;
  const defaultEffort = typeof defaults.effort === 'string' ? defaults.effort : repoDefaults.effort;
  const defaultThinking = typeof defaults.thinking === 'string' ? defaults.thinking : repoDefaults.thinking;
  const defaultMaxTokens = typeof defaults.maxTokens === 'number' ? defaults.maxTokens : undefined;
  const defaultSkills: unknown[] | undefined = Array.isArray(defaults.skills) ? defaults.skills : repoDefaults.skills;
  const defaultStageSkills = isRecord(defaults.stageSkills)
    ? defaults.stageSkills
    : repoDefaults.stageSkills;
  const epics = Array.isArray(raw.epics) ? raw.epics : [];

  return {
    ...raw,
    defaults: {
      ...repoDefaults,
      ...defaults,
      ...(defaultStageSkills ? { stageSkills: { ...defaultStageSkills, ...(isRecord(defaults.stageSkills) ? defaults.stageSkills : {}) } } : {}),
    },
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
            ...(feature.model === undefined && defaultModel ? { model: defaultModel } : {}),
            ...(feature.effort === undefined && defaultEffort ? { effort: defaultEffort } : {}),
            ...(feature.thinking === undefined && defaultThinking ? { thinking: defaultThinking } : {}),
            ...(feature.workflow === undefined && isRecord(defaults.workflow) ? { workflow: defaults.workflow } : {}),
            ...(feature.maxTokens === undefined && defaultMaxTokens !== undefined ? { maxTokens: defaultMaxTokens } : {}),
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

function occupiedFeatureIds(): Set<string> {
  try {
    return listOccupiedFeatureIds();
  } catch (error) {
    // A first load has no catalog file yet. Keep parsing available in that
    // state; the guarded SQLite publication remains the final uniqueness gate.
    const message = error instanceof Error ? error.message : String(error);
    if (/resolveDbPath|unable to open database|SQLITE_CANTOPEN|no such table/i.test(message)) return new Set();
    throw error;
  }
}

export interface LoadedBacklog {
  backlog: BacklogV2;
  registrations: FeatureRegistrationResult[];
}

export function loadBacklogWithRegistration(path = BACKLOG_FILE, cwd = process.cwd()): LoadedBacklog {
  const absPath = isAbsolute(path) ? path : resolve(cwd, path);
  const root = dirname(absPath);
  const raw = readFileSync(absPath, 'utf8');
  const repoDefaults = loadRepoConfig(cwd).defaults;
  const parsed = BacklogInputSchema.parse(applyDefaultsBeforeParse(parse(raw), repoDefaults));

  let v2Input: BacklogV2Input;
  if (parsed.version === 1) {
    console.warn('[msq] backlog.yaml is in v1 format — consider upgrading to version: 2');
    v2Input = normalizeV1(parsed, repoDefaults);
  } else {
    v2Input = propagateDefaults(parsed, repoDefaults);
  }

  const registration = registerBacklogFeatures(v2Input, occupiedFeatureIds());
  const { backlog: v2 } = registration;
  const normalized = BacklogV2Schema.parse(v2);
  validateToolReferences(normalized, cwd);
  validateFiles(normalized, root);
  return { backlog: normalized, registrations: registration.registrations };
}

export function loadBacklog(path = BACKLOG_FILE, cwd = process.cwd()): BacklogV2 {
  return loadBacklogWithRegistration(path, cwd).backlog;
}

export interface StagedBacklogFile {
  commit(): void;
  rollback(): void;
}

/**
 * Stages removal of successfully parsed features from the source YAML. The
 * original file remains recoverable until the caller commits its catalog
 * transaction.
 */
export function stageBacklogFile(path = BACKLOG_FILE, cwd = process.cwd(), backlog: BacklogV2): StagedBacklogFile {
  const absPath = isAbsolute(path) ? path : resolve(cwd, path);
  const parsedRaw: unknown = parse(readFileSync(absPath, 'utf8'));
  if (!isRecord(parsedRaw)) throw new Error(`Backlog YAML must contain a mapping: ${absPath}`);
  const raw = parsedRaw;
  const rawEpics: unknown[] = Array.isArray(raw.epics) ? raw.epics as unknown[] : [];
  let removedFeatures = 0;
  backlog.epics.forEach((epic, epicIndex) => {
    const rawEpic = rawEpics[epicIndex];
    if (!isRecord(rawEpic)) return;
    const rawFeatures: unknown[] = Array.isArray(rawEpic.features) ? rawEpic.features as unknown[] : [];
    const consumedIndexes = new Set(epic.features.map((_feature, featureIndex) => featureIndex));
    const remainingFeatures = rawFeatures.filter((_feature, featureIndex) => !consumedIndexes.has(featureIndex));
    removedFeatures += rawFeatures.length - remainingFeatures.length;
    rawEpic.features = remainingFeatures;
  });

  if (removedFeatures === 0) {
    return {
      commit: (): void => undefined,
      rollback: (): void => undefined,
    };
  }

  const temporaryPath = `${absPath}.msq-${String(process.pid)}-${String(Date.now())}.tmp`;
  const backupPath = `${absPath}.msq-${String(process.pid)}-${String(Date.now())}.bak`;
  let replaced = false;
  try {
    writeFileSync(temporaryPath, stringify(raw), 'utf8');
    renameSync(absPath, backupPath);
    renameSync(temporaryPath, absPath);
    replaced = true;
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    if (existsSync(backupPath) && !existsSync(absPath)) renameSync(backupPath, absPath);
    throw error;
  }

  return {
    commit(): void {
      rmSync(backupPath, { force: true });
    },
    rollback(): void {
      if (!replaced) return;
      rmSync(absPath, { force: true });
      if (existsSync(backupPath)) renameSync(backupPath, absPath);
      replaced = false;
    },
  };
}

/**
 * Reconstructs a fully-validated Backlog from the DB catalog tables
 * (populated by `msq backlog load`), instead of reading backlog.yaml.
 * This is the runtime source of truth after F35 — see docs/features/F35-backlog-catalog-import.md.
 */
export function loadBacklogFromCatalog(repoId: string, cwd = process.cwd()): BacklogV2 {
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

  return BacklogV2Schema.parse(propagateDefaults(BacklogV2Schema.parse(raw), loadRepoConfig(cwd).defaults));
}
