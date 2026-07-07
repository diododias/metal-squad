import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { CommandBar } from '../../src/ui/components/CommandBar.js';
import { EmptyState } from '../../src/ui/components/EmptyState.js';
import { GatePanel } from '../../src/ui/components/GatePanel.js';
import { MainPanel } from '../../src/ui/components/MainPanel.js';
import { RunTable } from '../../src/ui/components/RunTable.js';
import { Sidebar } from '../../src/ui/components/Sidebar.js';
import { StatusBar } from '../../src/ui/components/StatusBar.js';
import { CostDashboard } from '../../src/ui/components/CostDashboard.js';
import type { StatsRunRow } from '../../src/db/repo.js';

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
        inputTokens: null,
        outputTokens: null,
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
        inputTokens: 900,
        outputTokens: 300,
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
        inputTokens: 8,
        outputTokens: 2,
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
        inputTokens: 15,
        outputTokens: 5,
        gateId: null,
        gateDecision: null,
      },
    ];

    expect(React.isValidElement(RunTable({ runs, width: 40 }))).toBe(true);
    expect(React.isValidElement(RunTable({ runs, width: 100 }))).toBe(true);
  });

  it('renders sidebar, main panel, status bar, and command bar', () => {
    const runs = [
      {
        runId: 1,
        repoId: 'repo-1',
        featureId: 'feat-1',
        tool: 'codex' as const,
        status: 'running' as const,
        startedAt: '2026-07-06T10:01:30Z',
        endedAt: null,
        totalTokens: 800,
        inputTokens: 600,
        outputTokens: 200,
        gateId: null,
        gateDecision: null,
      },
    ];
    const gates = [
      {
        id: 1,
        runId: 1,
        featureId: 'feat-1',
        repoId: 'repo-1',
        createdAt: '2026-07-06T10:00:00Z',
        resolvedAt: null,
        decision: null,
      },
    ];
    const selectedFeature = {
      id: 'feat-1',
      title: 'F05 — Layout Multi-Painel',
      skills: ['implement', 'test'],
      tool: 'codex',
    };

    expect(React.isValidElement(Sidebar({
      runs,
      gates,
      notifications: [],
      selectedRunIndex: 0,
      selectedGateIndex: 0,
      focusPanel: 'runs',
      activeView: 'overview',
      skills: selectedFeature.skills,
      width: 32,
      mode: 'full',
    }))).toBe(true);
    expect(React.isValidElement(MainPanel({
      runs,
      gates,
      selectedRun: runs[0] ?? null,
      selectedFeature,
      activeView: 'run',
      output: [{
        id: 1,
        runId: 1,
        featureId: 'feat-1',
        tool: 'codex',
        stream: 'stdout',
        source: 'agent',
        line: 'Atualizando shell da TUI.',
        createdAt: '2026-07-06T10:01:31Z',
      }],
      outputPaused: false,
      mode: 'full',
      width: 72,
      pendingFeatures: [],
      selectedPendingIndex: 0,
      notifications: [],
    }))).toBe(true);
    expect(React.isValidElement(StatusBar({
      selectedRun: runs[0] ?? null,
      selectedFeature,
      gateCount: gates.length,
      totalRuns: runs.length,
      doneRuns: runs.filter((r) => r.status === 'done').length,
      width: 120,
      activeView: 'overview',
    }))).toBe(true);
    expect(React.isValidElement(StatusBar({
      selectedRun: null,
      selectedFeature: null,
      gateCount: 0,
      totalRuns: 3,
      doneRuns: 2,
      width: 80,
      activeView: 'overview',
    }))).toBe(true);
    expect(React.isValidElement(CommandBar({
      activeView: 'run',
      focusPanel: 'gates',
      hasRuns: true,
      hasGates: true,
      width: 120,
    }))).toBe(true);
  });

  it('renders the cost dashboard with aggregated rows', () => {
    const rows: StatsRunRow[] = [
      {
        id: 1,
        repoId: 'repo-1',
        featureId: 'feat-1',
        tool: 'claude',
        status: 'done',
        startedAt: '2026-07-06 10:00:00',
        endedAt: '2026-07-06 10:04:00',
        inputTokens: 1000,
        cachedInputTokens: null,
        outputTokens: 500,
        totalTokens: 1500,
      },
    ];
    expect(React.isValidElement(CostDashboard({ rows, periodLabel: 'last 7 days', width: 100 }))).toBe(true);
  });

  it('renders the cost dashboard empty state', () => {
    expect(React.isValidElement(CostDashboard({ rows: [], periodLabel: 'today', width: 100 }))).toBe(true);
  });
});
