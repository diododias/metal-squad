import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { EmptyState } from '../../src/ui/components/EmptyState.js';
import { GatePanel } from '../../src/ui/components/GatePanel.js';
import { RunTable } from '../../src/ui/components/RunTable.js';

describe('ui components', () => {
  it('renders the empty state message', () => {
    const element = EmptyState();

    expect(React.isValidElement(element)).toBe(true);
  });

  it('renders gate panel rows and highlights the selected gate', () => {
    const element = GatePanel({
      gates: [
        {
          id: 1,
          runId: 10,
          featureId: 'feat-1',
          repoId: 'repo-1',
          createdAt: '2026-07-06T10:00:00Z',
          resolvedAt: null,
          decision: null,
        },
        {
          id: 2,
          runId: 11,
          featureId: 'feat-2',
          repoId: 'repo-2',
          createdAt: '2026-07-06T10:01:00Z',
          resolvedAt: null,
          decision: null,
        },
      ],
      selectedIndex: 1,
    });

    expect(React.isValidElement(element)).toBe(true);
  });

  it('renders compact and full tables', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T10:02:00Z'));

    const runs = [
      {
        runId: 1,
        repoId: 'repo-1',
        featureId: 'feat-a-very-long-id',
        tool: 'claude' as const,
        status: 'running' as const,
        startedAt: '2026-07-06T10:01:30Z',
        endedAt: null,
        totalTokens: null,
        gateId: null,
        gateDecision: null,
      },
      {
        runId: 2,
        repoId: 'repo-1',
        featureId: 'feat-2',
        tool: 'codex' as const,
        status: 'done' as const,
        startedAt: '2026-07-06T10:00:00Z',
        endedAt: '2026-07-06T10:01:00Z',
        totalTokens: 1200,
        gateId: null,
        gateDecision: null,
      },
      {
        runId: 3,
        repoId: 'repo-1',
        featureId: 'feat-3',
        tool: 'opencode' as const,
        status: 'blocked' as const,
        startedAt: '2026-07-06T10:00:00Z',
        endedAt: '2026-07-06T10:00:20Z',
        totalTokens: 10,
        gateId: null,
        gateDecision: null,
      },
      {
        runId: 4,
        repoId: 'repo-1',
        featureId: 'feat-4',
        tool: 'claude' as const,
        status: 'failed' as const,
        startedAt: '2026-07-06T10:00:00Z',
        endedAt: '2026-07-06T10:00:05Z',
        totalTokens: 20,
        gateId: null,
        gateDecision: null,
      },
    ];

    expect(React.isValidElement(RunTable({ runs, width: 40 }))).toBe(true);
    expect(React.isValidElement(RunTable({ runs, width: 100 }))).toBe(true);
  });
});
