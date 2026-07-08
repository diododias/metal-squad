import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { BACKLOG_FILE } from './load.js';
import type { BacklogV2 } from './schema.js';

export interface SyncedTask {
  id: string;
  title: string;
  status: 'todo' | 'done';
  dependsOn: string[];
}

const TASK_LINE = /^- \[( |x|X)\] ([A-Z]\d+)\s+(.+)$/;

export function extractTasksFromMarkdown(markdown: string): SyncedTask[] {
  const tasks: SyncedTask[] = [];
  for (const line of markdown.split('\n')) {
    const match = TASK_LINE.exec(line.trim());
    if (!match) continue;
    tasks.push({
      id: match[2] ?? '',
      title: (match[3] ?? '').trim(),
      status: /x/i.test(match[1] ?? '') ? 'done' : 'todo',
      dependsOn: [],
    });
  }
  return tasks;
}

export function syncFeatureTasksToBacklog(
  featureId: string,
  tasksFile: string,
  cwd = process.cwd(),
  backlogPath = BACKLOG_FILE,
): number {
  const resolvedBacklogPath = resolve(cwd, backlogPath);
  const resolvedTasksPath = resolve(cwd, tasksFile);
  const backlog = parse(readFileSync(resolvedBacklogPath, 'utf8')) as BacklogV2;
  const tasks = extractTasksFromMarkdown(readFileSync(resolvedTasksPath, 'utf8'));

  let updated = false;
  for (const epic of backlog.epics) {
    for (const feature of epic.features) {
      if (feature.id !== featureId) continue;
      feature.tasks = tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        dependsOn: task.dependsOn,
      }));
      updated = true;
    }
  }

  if (!updated) {
    throw new Error(`Feature not found in backlog for task sync: ${featureId}`);
  }

  writeFileSync(resolvedBacklogPath, stringify(backlog));
  return tasks.length;
}
