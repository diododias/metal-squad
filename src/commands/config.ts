import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import {
  type ResolvedExecutionDefaults,
  mergeExecutionDefaults,
  resolveConfigSnapshot,
} from '../config/index.js';
import { loadBacklog, loadBacklogFromCatalog } from '../core/backlog/load.js';
import type { BacklogV2, Feature } from '../core/backlog/schema.js';
import { resolveRepo } from '../core/repo.js';

interface ConfigShowPayload {
  sources: {
    globalConfigPath: string;
    repoConfigPath?: string;
    backlogPath?: string;
  };
  runtime: ReturnType<typeof resolveConfigSnapshot>['runtime'];
  defaults: {
    backlog?: BacklogV2['defaults'];
    effective?: ResolvedExecutionDefaults;
  };
  feature?: {
    id: string;
    title: string;
    effective: ResolvedExecutionDefaults;
  };
}

export function registerConfig(program: Command): void {
  const config = program.command('config').description('Inspect resolved runtime and execution config');

  config
    .command('show')
    .description('Show the resolved config for this repo or one feature')
    .option('--feature <id>', 'resolve the effective execution config for one feature')
    .option('--json', 'emit machine-readable JSON')
    .action((opts: { feature?: string; json?: boolean }) => {
      const cwd = process.cwd();
      const snapshot = resolveConfigSnapshot(cwd);
      const backlog = tryLoadBacklog(cwd);
      const payload = buildPayload(snapshot, backlog, opts.feature);
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      console.log(formatHuman(payload));
    });
}

function tryLoadBacklog(cwd: string): BacklogV2 | null {
  const backlogPath = resolve(cwd, 'backlog.yaml');
  if (existsSync(backlogPath)) {
    return loadBacklog(backlogPath, cwd);
  }
  try {
    return loadBacklogFromCatalog(resolveRepo(cwd).repoId, cwd);
  } catch {
    return null;
  }
}

function buildPayload(
  snapshot: ReturnType<typeof resolveConfigSnapshot>,
  backlog: BacklogV2 | null,
  featureId?: string,
): ConfigShowPayload {
  const baseDefaults: ResolvedExecutionDefaults = {
    tool: 'claude', effort: 'medium', thinking: 'off', skills: [], stageSkills: {},
  };
  const effectiveDefaults = backlog
    ? mergeExecutionDefaults(baseDefaults, backlog.defaults)
    : baseDefaults;
  const feature = featureId && backlog ? findFeature(backlog, featureId) : null;
  if (featureId && !feature) {
    throw new Error(`Unknown feature "${featureId}".`);
  }
  return {
    sources: {
      ...snapshot.sources,
      ...(backlog ? { backlogPath: resolve(process.cwd(), 'backlog.yaml') } : {}),
    },
    runtime: snapshot.runtime,
    defaults: {
      ...(backlog ? { backlog: backlog.defaults, effective: effectiveDefaults } : {}),
    },
    ...(feature
      ? {
          feature: {
            id: feature.id,
            title: feature.title,
            effective: mergeExecutionDefaults(effectiveDefaults, feature),
          },
        }
      : {}),
  };
}

function findFeature(backlog: BacklogV2, featureId: string): Feature | null {
  for (const epic of backlog.epics) {
    for (const feature of epic.features) {
      if (feature.id === featureId) return feature;
    }
  }
  return null;
}

function formatHuman(payload: ConfigShowPayload): string {
  const lines = [
    'Resolved config',
    `global: ${payload.sources.globalConfigPath}`,
    `repo: ${payload.sources.repoConfigPath ?? 'not found'}`,
    `backlog: ${payload.sources.backlogPath ?? 'not found'}`,
    '',
    `runtime.concurrency: ${String(payload.runtime.concurrency)}`,
    `runtime.toolTimeoutMs: ${String(payload.runtime.toolTimeoutMs)}`,
    `runtime.staleRunThresholdMinutes: ${String(payload.runtime.staleRunThresholdMinutes)}`,
    `runtime.promptContextCharLimit: ${String(payload.runtime.promptContextCharLimit)}`,
  ];
  if (payload.defaults.effective) {
    lines.push('');
    lines.push(`defaults.tool: ${payload.defaults.effective.tool}`);
    lines.push(`defaults.model: ${payload.defaults.effective.model ?? '-'}`);
    lines.push(`defaults.effort: ${payload.defaults.effective.effort}`);
    lines.push(`defaults.skills: ${payload.defaults.effective.skills.join(', ') || '-'}`);
    lines.push(`defaults.stageSkills: ${formatStageSkills(payload.defaults.effective.stageSkills)}`);
  }
  if (payload.feature) {
    lines.push('');
    lines.push(`feature: ${payload.feature.id} — ${payload.feature.title}`);
    lines.push(`feature.tool: ${payload.feature.effective.tool}`);
    lines.push(`feature.model: ${payload.feature.effective.model ?? '-'}`);
    lines.push(`feature.effort: ${payload.feature.effective.effort}`);
    lines.push(`feature.skills: ${payload.feature.effective.skills.join(', ') || '-'}`);
    lines.push(`feature.stageSkills: ${formatStageSkills(payload.feature.effective.stageSkills)}`);
  }
  return lines.join('\n');
}

function formatStageSkills(stageSkills: Record<string, string[]>): string {
  const entries = Object.entries(stageSkills);
  if (entries.length === 0) return '-';
  return entries.map(([stage, skills]) => `${stage}=[${skills.join(', ')}]`).join('; ');
}
