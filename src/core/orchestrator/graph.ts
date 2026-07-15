import type { Backlog, Feature } from '../backlog/schema.js';

/** Achata o backlog em features e resolve ordem topológica por dependsOn. */
export function topoOrder(backlog: Backlog): Feature[] {
  const features = backlog.epics.flatMap((e) => e.features);
  const byId = new Map(features.map((f) => [f.id, f]));
  const visited = new Set<string>();
  const temp = new Set<string>();
  const out: Feature[] = [];

  const visit = (f: Feature): void => {
    if (visited.has(f.id)) return;
    if (temp.has(f.id)) throw new Error(`Ciclo de dependencia em ${f.id}`);
    temp.add(f.id);
    for (const dep of f.dependsOn) {
      const df = byId.get(dep);
      if (df) visit(df);
    }
    temp.delete(f.id);
    visited.add(f.id);
    out.push(f);
  };

  for (const f of features) visit(f);
  return out;
}

/** Seleciona uma feature e todas as dependências transitivas, preservando a ordem topológica. */
export function selectFeaturePlan(backlog: Backlog, featureId: string): Feature[] {
  const ordered = topoOrder(backlog);
  const byId = new Map(ordered.map((feature) => [feature.id, feature]));
  const selected = new Set<string>();

  const visit = (id: string, parent?: string): void => {
    const feature = byId.get(id);
    if (!feature) {
      if (parent) {
        throw new Error(`Feature ${parent} depends on missing feature ${id}`);
      }
      throw new Error(`Feature not found in backlog: ${id}. Rode "msq backlog load" para atualizar o catalogo.`);
    }

    if (selected.has(id)) return;
    for (const dep of feature.dependsOn) visit(dep, feature.id);
    selected.add(id);
  };

  visit(featureId);
  return ordered.filter((feature) => selected.has(feature.id));
}

export interface StartableFeaturePlan {
  target: Feature;
  pendingDependencies: string[];
  completedDependencies: string[];
}

/**
 * Manual start should never re-run parent features automatically.
 * If dependencies are already done in SQLite history, run only the target.
 * Otherwise, block the start and require the missing dependencies first.
 */
export function selectStartableFeaturePlan(
  backlog: Backlog,
  featureId: string,
  completedFeatureIds: ReadonlySet<string>,
): StartableFeaturePlan {
  const plan = selectFeaturePlan(backlog, featureId);
  const target = plan.find((feature) => feature.id === featureId);
  if (!target) {
    throw new Error(`Feature not found in backlog: ${featureId}. Rode "msq backlog load" para atualizar o catalogo.`);
  }
  const dependencies = plan.filter((feature) => feature.id !== featureId).map((feature) => feature.id);
  return {
    target,
    pendingDependencies: dependencies.filter((dependency) => !completedFeatureIds.has(dependency)),
    completedDependencies: dependencies.filter((dependency) => completedFeatureIds.has(dependency)),
  };
}
