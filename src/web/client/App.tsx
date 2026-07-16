import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar, type SidebarNavItem } from './components/navigation/Sidebar.js';
import { Modal } from './components/feedback/Modal.js';
import { NotificationList, type NotificationListItem } from './components/feedback/NotificationList.js';
import { useIsMobile, MobileTopBar, MobileTabBar } from './Responsive.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useLocalOutput, type OutputLine } from './hooks/useLocalOutput.js';
import { parseHash, type Route } from './lib/routes.js';
import { BoardPage } from './pages/BoardPage.js';
import { RunDetailPage } from './pages/RunDetailPage.js';
import { BacklogItemDetail } from './pages/BacklogItemDetail.js';
import { RunsPage } from './pages/RunsPage.js';
import { GatesPage } from './pages/GatesPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { ConfigPage } from './pages/ConfigPage.js';
import type { MsqWebState, WebSocketServerMessage, FeatureConfigPatch, FeatureConfigSaveResult, TaskConfigPatch } from '../types.js';
import type { RunHistoryEntry, TaskRun } from '../../db/repo.js';
import type { RunBreakdown } from '../../core/stats.js';
import type { SessionStatusSnapshot, ToolCallRecord } from '../../core/adapters/types.js';

interface RunDetailData {
  taskRuns: TaskRun[];
  breakdown: RunBreakdown | null;
  sessionStatus: SessionStatusSnapshot | null;
  statusHistory: SessionStatusSnapshot[];
  toolCalls: ToolCallRecord[];
}

function notificationTone(type: 'info' | 'notice'): NotificationListItem['tone'] {
  return type === 'notice' ? 'warn' : 'info';
}

export function App(): React.JSX.Element {
  const isMobile = useIsMobile(860);
  const [route, setRoute] = useState<Route>(parseHash(window.location.hash));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [state, setState] = useState<MsqWebState | null>(null);
  const [unread, setUnread] = useState(0);
  const [runDetails, setRunDetails] = useState<Record<number, RunDetailData>>({});
  const [runHistories, setRunHistories] = useState<Record<string, RunHistoryEntry[]>>({});
  const [workflowSaveResults, setWorkflowSaveResults] = useState<Record<string, FeatureConfigSaveResult>>({});
  const { linesByRun, append, clear } = useLocalOutput();
  const hasReceivedStateRef = useRef(false);

  useEffect(() => {
    function onHashChange(): void {
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener('hashchange', onHashChange);
    return (): void => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const onMessage = useCallback(
    (message: WebSocketServerMessage) => {
      if (message.type === 'state:full') {
        if (!hasReceivedStateRef.current) {
          hasReceivedStateRef.current = true;
          setUnread(message.payload.notifications.length);
        }
        setState(message.payload);
      } else if (message.type === 'run:output') {
        const payload = message.payload as OutputLine & { runId: number };
        append(payload.runId, payload);
      } else if (message.type === 'run:status') {
        const snapshot = message.payload;
        setState((current) => current ? {
          ...current,
          runs: current.runs.map((run) => run.runId === snapshot.runId && run.featureId === snapshot.featureId
            ? { ...run, sessionStatus: snapshot.status, sessionStartedAt: snapshot.startedAt, sessionUpdatedAt: snapshot.updatedAt, sessionElapsedMs: snapshot.elapsedMs, sessionLastOutputAt: snapshot.lastOutputAt, sessionIdleMs: snapshot.idleMs, sessionReason: snapshot.reason, sessionTerminal: snapshot.terminal }
            : run),
        } : current);
        setRunDetails((current) => {
          const existing = current[snapshot.runId];
          return { ...current, [snapshot.runId]: { taskRuns: existing?.taskRuns ?? [], breakdown: existing?.breakdown ?? null, sessionStatus: snapshot, statusHistory: [...(existing?.statusHistory ?? []), snapshot], toolCalls: existing?.toolCalls ?? [] } };
        });
      } else if (message.type === 'tool:call') {
        const record = message.payload;
        setRunDetails((current) => {
          const existing = current[record.runId];
          const calls = [...(existing?.toolCalls ?? []).filter((call) => call.id !== record.id), record].sort((a, b) => a.sequence - b.sequence);
          return { ...current, [record.runId]: { taskRuns: existing?.taskRuns ?? [], breakdown: existing?.breakdown ?? null, sessionStatus: existing?.sessionStatus ?? null, statusHistory: existing?.statusHistory ?? [], toolCalls: calls } };
        });
      } else if (message.type === 'run:detail') {
        setRunDetails((current) => ({
          ...current,
          [message.payload.runId]: { taskRuns: message.payload.taskRuns, breakdown: message.payload.breakdown, sessionStatus: message.payload.sessionStatus, statusHistory: message.payload.statusHistory, toolCalls: message.payload.toolCalls },
        }));
      } else if (message.type === 'run:history') {
        setRunHistories((current) => ({ ...current, [message.payload.featureId]: message.payload.runs }));
      } else if (message.type === 'featureConfig:saveResult') {
        setWorkflowSaveResults((current) => ({ ...current, [message.payload.featureId]: message }));
      }
    },
    [append],
  );

  const { send, error: connectionError } = useWebSocket(onMessage);

  function navigate(path: string): void {
    window.location.hash = path;
  }
  function logout(): void {
    fetch('/logout', { method: 'POST' })
      .catch(() => undefined)
      .finally(() => {
        window.location.href = '/auth';
      });
  }
  function openRun(featureId: string): void {
    window.location.hash = `/runs/${featureId}`;
  }
  function openBacklogItem(featureId: string): void {
    window.location.hash = `/backlog/${featureId}`;
  }

  const activePathPrefix =
    route.page === 'run-detail' ? '/runs' : route.page === 'backlog-detail' ? '/board' : `/${route.page}`;

  const navItems: SidebarNavItem[] = [
    { path: '/board', label: 'Board' },
    { path: '/runs', label: 'Runs' },
    { path: '/gates', label: 'Gates', count: state?.gates.length },
    { path: '/analytics', label: 'Analytics' },
    { path: '/config', label: 'Settings' },
  ];

  const totalTokens = (state?.runs ?? []).reduce((s, r) => s + (r.totalTokens ?? 0), 0);
  const runningCount = (state?.runs ?? []).filter((r) => r.status === 'running').length;

  const notifications: NotificationListItem[] = (state?.notifications ?? []).map((n) => ({
    id: n.id,
    tone: notificationTone(n.type),
    time: new Date(n.createdAt).toLocaleTimeString(),
    message: n.message,
  }));

  const requestRunSubscriptions = useCallback(
    (runId: number) => {
      clear(runId);
      send({ type: 'subscribe:output', runId });
      send({ type: 'subscribe:runDetail', runId });
      send({ type: 'subscribe:runChanges', runId });
      return (): void => {
        send({ type: 'unsubscribe:output', runId });
        send({ type: 'unsubscribe:runDetail', runId });
        send({ type: 'unsubscribe:runChanges', runId });
      };
    },
    [clear, send],
  );

  const requestHistorySubscription = useCallback(
    (featureId: string) => {
      send({ type: 'subscribe:runHistory', featureId });
      return (): void => {
        send({ type: 'unsubscribe:runHistory', featureId });
      };
    },
    [send],
  );

  let page: React.ReactNode = null;
  if (route.page === 'board') {
    page = state && (
      <BoardPage state={state} isMobile={isMobile} onOpenRun={openRun} onOpenBacklogItem={openBacklogItem} />
    );
  } else if (route.page === 'runs') {
    page = state && <RunsPage state={state} onOpenRun={openRun} />;
  } else if (route.page === 'run-detail') {
    page = state && (
      <RunDetailPage
        state={state}
        featureId={route.featureId}
        runDetails={runDetails}
        linesByRun={linesByRun}
        onSubscribeRun={requestRunSubscriptions}
        onBack={() => { navigate('/runs'); }}
        send={send}
      />
    );
  } else if (route.page === 'backlog-detail') {
    page = state && (
      <BacklogItemDetail
        state={state}
        featureId={route.featureId}
        runHistories={runHistories}
        onSubscribeHistory={requestHistorySubscription}
        onBack={() => { navigate('/board'); }}
        onStart={(featureId: string) => {
          send({ type: 'action:startFeature', featureId });
          navigate('/board');
        }}
        onSaveConfig={(featureId: string, patch: FeatureConfigPatch) => {
          setWorkflowSaveResults((current) => {
            return Object.fromEntries(
              Object.entries(current).filter(([resultFeatureId]) => resultFeatureId !== featureId),
            );
          });
          send({ type: 'action:updateFeatureConfig', featureId, patch });
        }}
        workflowSaveResult={workflowSaveResults[route.featureId]}
        onSaveTaskConfig={(featureId: string, taskId: string, patch: TaskConfigPatch) =>
          { send({ type: 'action:updateTaskConfig', featureId, taskId, patch }); }
        }
        onOpenRun={openRun}
      />
    );
  } else if (route.page === 'gates') {
    page = state && <GatesPage state={state} send={send} />;
  } else if (route.page === 'analytics') {
    page = state && <AnalyticsPage state={state} />;
  } else {
    page = state && <ConfigPage state={state} isMobile={isMobile} send={send} />;
  }

  return (
    <div
      className="app-root"
      style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', width: '100vw', overflow: 'hidden', background: 'var(--bg-base)' }}
    >
      {!isMobile && (
        <Sidebar
          items={navItems}
          activePath={activePathPrefix}
          statusLine={`${runningCount > 0 ? 'live' : 'idle'} · ${(totalTokens / 1000).toFixed(1)}k tok`}
          live={runningCount > 0}
          notificationCount={unread}
          onNavigate={navigate}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => { setSidebarCollapsed((collapsed) => !collapsed); }}
          onNotifications={() => {
            setNotificationsOpen(true);
            setUnread(0);
          }}
          onLogout={logout}
        />
      )}
      {isMobile && (
        <MobileTopBar
          live={runningCount > 0}
          notificationCount={unread}
          onNotifications={() => {
            setNotificationsOpen(true);
            setUnread(0);
          }}
          onLogout={logout}
        />
      )}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {page ?? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: connectionError ? 'var(--accent-warn)' : 'var(--text-dim)', fontFamily: 'var(--font-mono)', padding: 24, textAlign: 'center' }}>
            {connectionError ?? 'connecting…'}
          </div>
        )}
      </div>
      {isMobile && <MobileTabBar items={navItems} activePath={activePathPrefix} onNavigate={navigate} />}
      <Modal open={notificationsOpen} onClose={() => { setNotificationsOpen(false); }} width={isMobile ? 320 : 440}>
        <div style={{ padding: 18 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '26px', fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '0.02em' }}>Notifications</h2>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', marginBottom: 14 }}>Last {notifications.length} events across all features</div>
          <NotificationList notifications={notifications} />
        </div>
      </Modal>
    </div>
  );
}
