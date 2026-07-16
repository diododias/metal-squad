import { readFileSync, existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  BacklogInputSchema,
  BacklogV2InputSchema,
  BacklogV2Schema,
  BudgetSchema,
  DefaultsSchema,
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
import { resolveRepo } from '../repo.js';

export const BACKLOG_FILE = 'backlog.yaml';

type RawYamlMap = Record<string, unknown>;

function isRecord(value: unknown): value is RawYamlMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeV1(backlog: BacklogV1Input): BacklogV2Input {
  return {
    version: 2,
    repo: backlog.repo,
    epics: backlog.epics,
  };
}

function applyProjectDefaults(raw: BacklogV2Input, defaults: Defaults, budget?: unknown): unknown {
  return {
    version: 2,
    repo: raw.repo,
    defaults,
    ...(budget === undefined ? {} : { budget }),
    epics: raw.epics.map((epic) => ({
      ...epic,
      features: epic.features.map((feature): unknown => ({
        ...feature,
        tool: feature.tool ?? defaults.tool,
        ...(feature.model === undefined ? (defaults.model === undefined ? {} : { model: defaults.model }) : {}),
        effort: feature.effort ?? defaults.effort,
        thinking: feature.thinking ?? defaults.thinking,
        dependsOn: feature.dependsOn ?? [],
        tasks: (feature.tasks ?? []).map((task) => ({
          ...task,
          skills: task.skills ?? defaults.skills,
        })),
        skills: feature.skills ?? defaults.skills,
        workflow: feature.workflow ?? defaults.workflow,
        ...(feature.maxTokens === undefined ? (defaults.maxTokens === undefined ? {} : { maxTokens: defaults.maxTokens }) : {}),
        autoStart: feature.autoStart ?? false,
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

function projectSettings(cwd: string): { defaults: Defaults; budget?: unknown } {
  const meta = getCatalogMeta(resolveRepo(cwd).repoId);
  return {
    defaults: meta ? DefaultsSchema.parse(JSON.parse(meta.defaults_json)) : DefaultsSchema.parse({}),
    ...(meta?.budget_json ? { budget: BudgetSchema.parse(JSON.parse(meta.budget_json)) } : {}),
  };
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
  const raw: unknown = parse(readFileSync(absPath, 'utf8'));
  const parsed = BacklogInputSchema.parse(raw);
  const settings = projectSettings(cwd);

  let v2Input: BacklogV2Input;
  if (parsed.version === 1) {
    console.warn('[msq] backlog.yaml is in v1 format — consider upgrading to version: 2');
    v2Input = normalizeV1(parsed);
  } else {
    if ('defaults' in parsed && parsed.defaults !== undefined) {
      console.warn('[msq] backlog.yaml defaults are ignored; configure defaults in the Projeto settings.');
    }
    if ('budget' in parsed && parsed.budget !== undefined) {
      console.warn('[msq] backlog.yaml budget is ignored; configure it in the Projeto settings.');
    }
    v2Input = parsed;
  }

  const resolved = BacklogV2InputSchema.parse(applyProjectDefaults(v2Input, settings.defaults, settings.budget));
  const registration = registerBacklogFeatures(resolved, occupiedFeatureIds());
  const { backlog: v2 } = registration;
  const normalized = BacklogV2Schema.parse(v2);
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
export function loadBacklogFromCatalog(repoId: string, _cwd = process.cwd()): BacklogV2 {
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

  const raw: BacklogV2Input = BacklogV2Schema.parse({
    version: 2 as const,
    repo: meta.repo,
    defaults: JSON.parse(meta.defaults_json) as Defaults,
    ...(meta.budget_json ? { budget: JSON.parse(meta.budget_json) as unknown } : {}),
    epics,
  });

  return BacklogV2Schema.parse(applyProjectDefaults(
    raw,
    DefaultsSchema.parse(JSON.parse(meta.defaults_json)),
    meta.budget_json ? BudgetSchema.parse(JSON.parse(meta.budget_json)) : undefined,
  ));
}
