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
