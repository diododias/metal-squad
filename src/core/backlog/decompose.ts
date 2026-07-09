import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { BACKLOG_FILE } from './load.js';
import type { BacklogV2, Task } from './schema.js';

export const DecomposeEstimateSchema = z.object({
  tokens: z.union([z.string(), z.number()]).optional(),
  duration: z.union([z.string(), z.number()]).optional(),
  files: z.array(z.string()).default([]),
});

export const DecomposeTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  taskFile: z.string().optional(),
  skills: z.array(z.string()).optional(),
  estimate: DecomposeEstimateSchema.optional(),
  dependsOn: z.array(z.string()).default([]),
});

export const DecomposeOutputSchema = z.object({
  tasks: z.array(DecomposeTaskSchema).min(1),
});

export type DecomposeTask = z.infer<typeof DecomposeTaskSchema>;
export type DecomposeOutput = z.infer<typeof DecomposeOutputSchema>;

/** Caminho deterministico onde a skill `decompose` deve escrever a sugestao. */
export function decomposeOutputPath(featureId: string, cwd = process.cwd()): string {
  return join(cwd, '.msq', 'generated', featureId, 'decompose.yaml');
}

export function readDecomposeOutput(featureId: string, cwd = process.cwd()): DecomposeOutput {
  const path = decomposeOutputPath(featureId, cwd);
  if (!existsSync(path)) {
    throw new Error(
      `Decompose output not found: ${path}. The agent must write the suggestion YAML to this path.`,
    );
  }
  return parseDecomposeOutput(readFileSync(path, 'utf8'), path);
}

export function parseDecomposeOutput(raw: string, sourcePath?: string): DecomposeOutput {
  const parsed = DecomposeOutputSchema.safeParse(parse(raw));
  if (!parsed.success) {
    const origin = sourcePath ? ` (${sourcePath})` : '';
    throw new Error(`Invalid decompose output${origin}: ${parsed.error.message}`);
  }
  const ids = new Set<string>();
  for (const task of parsed.data.tasks) {
    if (ids.has(task.id)) {
      throw new Error(`Invalid decompose output: duplicated task id "${task.id}"`);
    }
    ids.add(task.id);
    for (const dependency of task.dependsOn) {
      if (!parsed.data.tasks.some((candidate) => candidate.id === dependency)) {
        throw new Error(
          `Invalid decompose output: task "${task.id}" depends on unknown task "${dependency}"`,
        );
      }
    }
  }
  return parsed.data;
}

/**
 * Merge das tasks sugeridas no backlog.yaml da feature. Idempotente: tasks com
 * o mesmo id sao substituidas, novas sao adicionadas, e reruns nao duplicam.
 */
export function applyDecomposedTasks(
  featureId: string,
  tasks: DecomposeTask[],
  cwd = process.cwd(),
  backlogPath = BACKLOG_FILE,
): number {
  const resolvedBacklogPath = resolve(cwd, backlogPath);
  const backlog = parse(readFileSync(resolvedBacklogPath, 'utf8')) as BacklogV2;

  let feature: { tasks?: Task[] } | null = null;
  for (const epic of backlog.epics) {
    for (const candidate of epic.features) {
      if (candidate.id === featureId) feature = candidate;
    }
  }
  if (!feature) {
    throw new Error(`Feature not found in backlog for decompose apply: ${featureId}`);
  }

  const existing = feature.tasks ?? [];
  const suggestedIds = new Set(tasks.map((task) => task.id));
  const preserved = existing.filter((task) => !suggestedIds.has(task.id));
  feature.tasks = [
    ...preserved,
    ...tasks.map((task) => toBacklogTask(task, existing)),
  ];

  writeFileSync(resolvedBacklogPath, stringify(backlog));
  return tasks.length;
}

function toBacklogTask(task: DecomposeTask, existing: Task[]): Task {
  const previous = existing.find((candidate) => candidate.id === task.id);
  return {
    id: task.id,
    title: task.title,
    status: previous?.status ?? 'todo',
    dependsOn: task.dependsOn,
    ...(task.taskFile ? { taskFile: task.taskFile } : {}),
    ...(task.skills && task.skills.length > 0 ? { skills: task.skills } : {}),
  };
}

export function formatDecomposeSummary(featureId: string, output: DecomposeOutput): string {
  const lines = [`Decomposicao sugerida para ${featureId} (${String(output.tasks.length)} tasks):`, ''];
  for (const task of output.tasks) {
    const estimate = task.estimate;
    const details = [
      estimate?.tokens !== undefined ? `tokens ${String(estimate.tokens)}` : null,
      estimate?.duration !== undefined ? `duracao ${String(estimate.duration)}` : null,
      estimate && estimate.files.length > 0 ? `arquivos ${estimate.files.join(', ')}` : null,
      task.dependsOn.length > 0 ? `depende de ${task.dependsOn.join(', ')}` : null,
    ].filter(Boolean).join(' | ');
    lines.push(`- ${task.id}: ${task.title}${details ? ` (${details})` : ''}`);
  }
  return lines.join('\n');
}
