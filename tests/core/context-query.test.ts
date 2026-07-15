import { describe, expect, it } from 'vitest';
import { deriveContextQueryEvent } from '../../src/core/events/context-query.js';
import type { RunOutputEvent } from '../../src/core/events/types.js';

function output(line: string, overrides: Partial<RunOutputEvent> = {}): RunOutputEvent {
  return {
    runId: 17,
    featureId: 'feat-context',
    tool: 'codex',
    stream: 'stdout',
    source: 'tool',
    line,
    ...overrides,
  };
}

describe('deriveContextQueryEvent', () => {
  it('records structured Dora and Serena queries with telemetry', () => {
    expect(deriveContextQueryEvent(output('tool mcp__dora__symbol find FeatureConfig latencyMs=42 cache hit'))).toMatchObject({
      runId: 17,
      featureId: 'feat-context',
      queryTool: 'dora',
      kind: 'structured',
      target: 'find FeatureConfig latencyMs=42 cache hit',
      latencyMs: 42,
      cacheHit: true,
    });

    expect(deriveContextQueryEvent(output('tool serena.find_symbol {"name":"App","latency_ms":7,"cache_hit":false}'))).toMatchObject({
      queryTool: 'serena',
      kind: 'structured',
      latencyMs: 7,
      cacheHit: false,
    });
  });

  it('records only filesystem-reading shell commands and their targets', () => {
    expect(deriveContextQueryEvent(output('shell rg -n Workflow src/web/client/App.tsx -> 12 matches'))).toMatchObject({
      queryTool: 'shell',
      kind: 'shell_read',
      target: 'rg -n Workflow src/web/client/App.tsx',
    });

    expect(deriveContextQueryEvent(output('tool exec_command {"command":"git diff -- src/web/client/App.tsx"} duration_ms: 9'))).toMatchObject({
      queryTool: 'shell',
      target: 'git diff -- src/web/client/App.tsx',
      latencyMs: 9,
    });

    expect(deriveContextQueryEvent(output('shell npm test'))).toBeNull();
  });

  it('ignores heartbeat, blank, and unrelated output', () => {
    expect(deriveContextQueryEvent(output(' tool mcp__dora__map ', { source: 'heartbeat' }))).toBeNull();
    expect(deriveContextQueryEvent(output('   '))).toBeNull();
    expect(deriveContextQueryEvent(output('agent wrote implementation notes'))).toBeNull();
  });
});
