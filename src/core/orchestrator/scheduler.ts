import type { Feature } from '../backlog/schema.js';
import type { RunResult } from '../adapters/types.js';

export type FeatureExecutor = (feature: Feature) => Promise<RunResult>;

export interface SchedulerOptions {
  concurrency: number; // limite global (default 3)
  execute: FeatureExecutor;
  onStart?: (feature: Feature) => void;
  onDone?: (feature: Feature, result: RunResult) => void;
}

/**
 * Executa features respeitando dependsOn e o limite global de concorrência.
 * Política de falha: stop-and-notify (sem retry automático).
 */
export async function schedule(
  ordered: Feature[],
  opts: SchedulerOptions,
): Promise<void> {
  const done = new Set<string>();
  const remaining = [...ordered];
  let active = 0;
  let failed = false;

  const ready = (): Feature[] =>
    remaining.filter((f) => f.dependsOn.every((d) => done.has(d)));

  await new Promise<void>((resolve, reject) => {
    const pump = (): void => {
      if (failed) return;
      if (remaining.length === 0 && active === 0) return resolve();
      const readyFeatures = ready();
      if (readyFeatures.length === 0 && active === 0) {
        const blockers = remaining
          .map((feature) => {
            const missing = feature.dependsOn.filter((dep) => !done.has(dep));
            return `${feature.id} -> [${missing.join(', ')}]`;
          })
          .join('; ');
        return reject(
          new Error(
            `Deadlock: no executable features are ready. Unsatisfied dependencies: ${blockers}`,
          ),
        );
      }

      for (const f of readyFeatures) {
        if (active >= opts.concurrency) break;
        remaining.splice(remaining.indexOf(f), 1);
        active++;
        opts.onStart?.(f);
        opts
          .execute(f)
          .then((res) => {
            active--;
            opts.onDone?.(f, res);
            if (!res.ok) {
              failed = true;
              return reject(new Error(`Feature ${f.id} falhou: ${res.summary}`));
            }
            done.add(f.id);
            pump();
          })
          .catch((err) => {
            active--;
            failed = true;
            reject(err);
          });
      }
    };
    pump();
  });
}
