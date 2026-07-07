import type { Feature } from '../backlog/schema.js';
import type { RunResult } from '../adapters/types.js';

export type FeatureExecutor = (feature: Feature) => Promise<RunResult>;
export type SchedulerState = 'running' | 'paused' | 'aborting';
export type SchedulerOutcome = 'completed' | 'aborted';

export interface SchedulerOptions {
  concurrency: number;
  execute: FeatureExecutor;
  initialDone?: Iterable<string>;
  onStart?: (feature: Feature) => void;
  onDone?: (feature: Feature, result: RunResult) => void;
  onAbortFeature?: (featureId: string) => void;
  onStateChange?: (state: SchedulerState) => void;
  /**
   * Called before dispatching each ready feature. Returning false pauses the
   * scheduler instead of dispatching (e.g. budget exhausted). Resuming re-checks.
   */
  beforeDispatch?: (feature: Feature) => boolean;
}

export interface SchedulerController {
  readonly result: Promise<SchedulerOutcome>;
  getState(): SchedulerState;
  pause(): void;
  resume(): void;
  abortFeature(featureId: string): boolean;
  abortAll(): void;
}

export function schedule(
  ordered: Feature[],
  opts: SchedulerOptions,
): SchedulerController {
  const done = new Set<string>(opts.initialDone ?? []);
  const remaining = [...ordered];
  const active = new Map<string, Feature>();
  let state: SchedulerState = 'running';
  let settled = false;
  let resolveResult!: (value: SchedulerOutcome) => void;
  let rejectResult!: (reason?: unknown) => void;

  const result = new Promise<SchedulerOutcome>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const setState = (next: SchedulerState): void => {
    if (state === next) return;
    state = next;
    opts.onStateChange?.(state);
  };

  const ready = (): Feature[] =>
    remaining.filter((feature) => feature.dependsOn.every((dependency) => done.has(dependency)));

  const maybeFinish = (): boolean => {
    if (settled) return true;
    if (remaining.length === 0 && active.size === 0) {
      settled = true;
      resolveResult('completed');
      return true;
    }
    if (state === 'aborting' && active.size === 0) {
      settled = true;
      resolveResult('aborted');
      return true;
    }
    return false;
  };

  const pump = (): void => {
    if (settled) return;
    if (maybeFinish()) return;
    if (state !== 'running') return;

    const readyFeatures = ready();
    if (readyFeatures.length === 0 && active.size === 0) {
      const blockers = remaining
        .map((feature) => {
          const missing = feature.dependsOn.filter((dependency) => !done.has(dependency));
          return `${feature.id} -> [${missing.join(', ')}]`;
        })
        .join('; ');
      settled = true;
      rejectResult(
        new Error(
          `Deadlock: no executable features are ready. Unsatisfied dependencies: ${blockers}`,
        ),
      );
      return;
    }

    for (const feature of readyFeatures) {
      if (active.size >= opts.concurrency || state !== 'running') break;
      if (opts.beforeDispatch && !opts.beforeDispatch(feature)) {
        setState('paused');
        break;
      }
      remaining.splice(remaining.indexOf(feature), 1);
      active.set(feature.id, feature);
      opts.onStart?.(feature);

      opts.execute(feature)
        .then((resultValue) => {
          active.delete(feature.id);
          opts.onDone?.(feature, resultValue);

          if (resultValue.aborted) {
            if (state === 'aborting') {
              maybeFinish();
              return;
            }
            remaining.unshift(feature);
            pump();
            return;
          }

          if (!resultValue.ok) {
            const policy = feature.retry?.onFail ?? 'stop';
            if (policy === 'stop') {
              settled = true;
              rejectResult(new Error(`Feature ${feature.id} falhou: ${resultValue.summary}`));
              return;
            }
            done.add(feature.id);
            pump();
            return;
          }

          done.add(feature.id);
          pump();
        })
        .catch((error) => {
          active.delete(feature.id);
          settled = true;
          rejectResult(error);
        });
    }
  };

  queueMicrotask(pump);

  return {
    result,
    getState: () => state,
    pause() {
      if (settled || state === 'aborting') return;
      setState('paused');
    },
    resume() {
      if (settled || state !== 'paused') return;
      setState('running');
      pump();
    },
    abortFeature(featureId: string) {
      const feature = active.get(featureId);
      if (!feature || settled) return false;
      opts.onAbortFeature?.(featureId);
      return true;
    },
    abortAll() {
      if (settled || state === 'aborting') return;
      setState('aborting');
      for (const featureId of active.keys()) {
        opts.onAbortFeature?.(featureId);
      }
      maybeFinish();
    },
  };
}
