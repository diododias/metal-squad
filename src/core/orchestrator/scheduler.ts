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
  const abortRequested = new Set<string>();
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
      if (active.size >= opts.concurrency) break;
      remaining.splice(remaining.indexOf(feature), 1);
      active.set(feature.id, feature);
      opts.onStart?.(feature);

      opts.execute(feature)
        .then((resultValue) => {
          active.delete(feature.id);
          opts.onDone?.(feature, resultValue);

          if (resultValue.aborted) {
            const wasRequested = abortRequested.delete(feature.id);
            if (state === 'aborting') {
              maybeFinish();
              return;
            }
            // A single-feature abort requested via `abortFeature()` requeues
            // and waits for an explicit `resume()`. An abort that arrives
            // without ever being requested (adapter self-cancel, budget
            // protective stop) has no one left to call resume — treat it
            // like a whole-pipeline abort so the scheduler settles instead
            // of endlessly re-dispatching the same feature.
            remaining.unshift(feature);
            if (wasRequested) {
              pump();
              return;
            }
            setState('aborting');
            maybeFinish();
            return;
          }

          if (resultValue.timeout) {
            remaining.unshift(feature);
            setState('paused');
            return;
          }

          if (!resultValue.ok) {
            const policy = feature.retry?.onFail ?? 'stop';
            if (policy === 'stop') {
              settled = true;
              rejectResult(new Error(`Feature ${feature.id} falhou: ${resultValue.summary}`));
              return;
            }
            if (policy === 'gate') {
              // A gate needs a human decision before this feature can be
              // retried, so it stays neither done nor dropped: put it back in
              // remaining and pause, mirroring a budget-violation pause.
              // resume() re-dispatches it once the gate is resolved.
              remaining.unshift(feature);
              setState('paused');
              return;
            }
            done.add(feature.id);
            pump();
            return;
          }

          done.add(feature.id);
          pump();
        })
        .catch((error: unknown) => {
          active.delete(feature.id);
          settled = true;
          rejectResult(error);
        });
    }
  };

  queueMicrotask(pump);

  return {
    result,
    getState: (): SchedulerState => state,
    pause(): void {
      if (settled || state === 'aborting') return;
      setState('paused');
    },
    resume(): void {
      if (settled || state !== 'paused') return;
      setState('running');
      pump();
    },
    abortFeature(featureId: string): boolean {
      const feature = active.get(featureId);
      if (!feature || settled) return false;
      abortRequested.add(featureId);
      opts.onAbortFeature?.(featureId);
      return true;
    },
    abortAll(): void {
      if (settled || state === 'aborting') return;
      setState('aborting');
      for (const featureId of active.keys()) {
        opts.onAbortFeature?.(featureId);
      }
      maybeFinish();
    },
  };
}
