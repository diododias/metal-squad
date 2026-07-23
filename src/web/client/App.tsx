import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar, type SidebarNavItem } from './components/navigation/Sidebar.js';
import { Modal } from './components/feedback/Modal.js';
import { NotificationList, type NotificationListItem } from './components/feedback/NotificationList.js';
import { ToastStack, type ToastStackItem } from './components/feedback/ToastStack.js';
import type { ToastTone } from './components/feedback/Toast.js';
import { useIsMobile, MobileTopBar, MobileTabBar } from './Responsive.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useLocalOutput, type OutputLine } from './hooks/useLocalOutput.js';
import { ActiveProjectProvider, useActiveProject } from './hooks/useActiveProject.js';
import { parseHash, type Route } from './lib/routes.js';
import { hashWithRestoredQuery } from './lib/hashState.js';
import { BoardPage } from './pages/BoardPage.js';
import { RunDetailPage } from './pages/RunDetailPage.js';
import { BacklogItemDetail } from './pages/BacklogItemDetail.js';
import { RunsPage } from './pages/RunsPage.js';
import { GatesPage } from './pages/GatesPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { ConfigPage } from './pages/ConfigPage.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { ProjectDetailPage } from './pages/ProjectDetailPage.js';
import { EpicDetailPage } from './pages/EpicDetailPage.js';
import { ArchivedPage } from './pages/ArchivedPage.js';
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

/**
 * Maps a UiNotification to a toast tone. Returns `null` when the notification
 * shouldn't toast at all (e.g. low-priority info events that already surface in
 * the bell feed). Prefers an explicit `tone` set by the server (so `run:failed`
 * toasts as danger even though it's persisted as `type: 'notice'`).
 */
function notificationToneForToast(notification: { tone?: 'info' | 'ok' | 'warn' | 'danger'; type: 'info' | 'notice' }): ToastTone | null {
  if (notification.tone) return notification.tone;
  return notification.type === 'notice' ? 'warn' : null;
}

export function App(): React.JSX.Element {
  const isMobile = useIsMobile(860);
  const [route, setRoute] = useState<Route>(parseHash(window.location.hash));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [state, setState] = useState<MsqWebState | null>(null);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<ToastStackItem[]>([]);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const [runDetails, setRunDetails] = useState<Record<number, RunDetailData>>({});
  const [runHistories, setRunHistories] = useState<Record<string, RunHistoryEntry[]>>({});
  const [workflowSaveResults, setWorkflowSaveResults] = useState<Record<string, FeatureConfigSaveResult>>({});
  const [projectActionResults, setProjectActionResults] = useState<Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>>({});
  const [archivedResults, setArchivedResults] = useState<Record<string, Extract<WebSocketServerMessage, { type: 'action:archivedResult' }>>>({});
  const [auditTrailResults, setAuditTrailResults] = useState<Record<string, Extract<WebSocketServerMessage, { type: 'action:auditTrailResult' }>>>({});
  const [analyticsMessage, setAnalyticsMessage] = useState<WebSocketServerMessage | null>(null);
  const { linesByRun, append, clear } = useLocalOutput();
  const hasReceivedStateRef = useRef(false);

  const dismissToast = useCallback((id: string): void => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback((item: ToastStackItem): void => {
    setToasts((current) => {
      // Replace a toast with the same id/source/message rather than stack
      // duplicates — guards against noisy event bursts.
      const filtered = current.filter((existing) => existing.id !== item.id);
      return [...filtered, item].slice(-6);
    });
  }, []);

  // Browser-side unhandled surface. A throw inside a React event handler or
  // an async callback that no `.catch` owns becomes an unhandledrejection
  // here; the user wouldn't otherwise see a thing. We surface it as a toast
  // (and console.error) so the operator can react.
  useEffect(() => {
    function onError(event: ErrorEvent): void {
      // The DOM lib types `ErrorEvent.error` as `any`, so we narrow it
      // explicitly before doing anything with it — passing the raw value
      // around would propagate the `any` and trigger unsafe-assignment.
      const error: unknown = event.error;
      const errorInstance = error instanceof Error ? error : null;
      const message = errorInstance?.message ?? (event.message || 'Unknown runtime error');
      console.error('[unhandled] error', message, errorInstance?.stack ?? error);
      pushToast({
        id: `error-${String(Date.now())}-${String(Math.random()).slice(2, 6)}`,
        tone: 'danger',
        source: 'Runtime error',
        message,
        ttlMs: 8000,
      });
    }
    function onUnhandledRejection(event: PromiseRejectionEvent): void {
      const reason: unknown = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error('[unhandled] rejection', message);
      pushToast({
        id: `rejection-${String(Date.now())}-${String(Math.random()).slice(2, 6)}`,
        tone: 'danger',
        source: 'Unhandled promise',
        message,
        ttlMs: 8000,
      });
    }
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return (): void => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [pushToast]);

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
      if (message.type === 'analytics:workItems' || message.type === 'analytics:breakdown' || message.type === 'analytics:runDrilldown' || message.type === 'analytics:export') {
        setAnalyticsMessage(message);
      } else if (message.type === 'state:full') {
        const arrivedNotifications = message.payload.notifications;
        if (!hasReceivedStateRef.current) {
          hasReceivedStateRef.current = true;
          setUnread(arrivedNotifications.length);
          // Seed the seen set with whatever was already queued on the server
          // so the initial render doesn't fire a toast storm of historical
          // events. From here on, only *new* notifications toast.
          for (const notification of arrivedNotifications) {
            seenNotificationIdsRef.current.add(notification.id);
          }
        } else {
          for (const notification of arrivedNotifications) {
            if (seenNotificationIdsRef.current.has(notification.id)) continue;
            seenNotificationIdsRef.current.add(notification.id);
            const tone = notificationToneForToast(notification);
            if (!tone) continue;
            pushToast({
              id: notification.id,
              tone,
              source: notification.event ?? notification.type,
              message: notification.message,
              ttlMs: tone === 'danger' ? 8000 : 5200,
            });
          }
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
      } else if (message.type === 'action:result') {
        setProjectActionResults((current) => ({ ...current, [message.payload.requestId]: message }));
      } else if (message.type === 'action:archivedResult') {
        setArchivedResults((current) => ({ ...current, [message.payload.requestId]: message }));
      } else if (message.type === 'action:auditTrailResult') {
        setAuditTrailResults((current) => ({ ...current, [message.payload.requestId]: message }));
      }
    },
    [append, pushToast],
  );

  const { send, error: connectionError, connected } = useWebSocket(onMessage);

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
    { path: '/projects', label: 'Projects', count: state?.projects.filter((project) => project.archivedAt === null).length },
    { path: '/runs', label: 'Runs' },
    { path: '/gates', label: 'Gates', count: state?.gates.length },
    { path: '/analytics', label: 'Analytics' },
    { path: '/archived', label: 'Archived' },
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
        send={send}
        actionResults={projectActionResults}
      />
    );
  } else if (route.page === 'gates') {
    page = state && <GatesPage state={state} send={send} />;
  } else if (route.page === 'analytics') {
    page = state && <AnalyticsPage state={state} send={send} analyticsMessage={analyticsMessage} />;
  } else if (route.page === 'projects') {
    page = state && <ProjectsPage state={state} send={send} actionResults={projectActionResults} />;
  } else if (route.page === 'project-detail') {
    page = state && <ProjectDetailPage state={state} projectId={route.projectId} send={send} actionResults={projectActionResults} archivedResults={archivedResults} onBack={() => { navigate('/projects'); }} onToast={pushToast} connected={connected} />;
  } else if (route.page === 'epic-detail') {
    page = state && (
      <EpicDetailPage
        state={state}
        projectId={route.projectId}
        epicId={route.epicId}
        send={send}
        actionResults={projectActionResults}
        archivedResults={archivedResults}
        onBack={() => { navigate(hashWithRestoredQuery(`/projects/${route.projectId}`)); }}
        onOpenBacklogItem={(featureId: string) => { navigate(`/projects/${route.projectId}/epics/${route.epicId}/items/${featureId}`); }}
        onToast={pushToast}
        connected={connected}
      />
    );
  } else if (route.page === 'epic-item-detail') {
    const item = state?.featureCatalog[route.featureId];
    const epic = state?.epics.find((candidate) => candidate.epicId === route.epicId && candidate.projectId === route.projectId);
    const project = state?.projects.find((candidate) => candidate.projectId === route.projectId);
    const epicPath = hashWithRestoredQuery(`/projects/${route.projectId}/epics/${route.epicId}`);
    if (state && (item?.epicId !== route.epicId || !epic || !project)) {
      page = (
        <div style={{ padding: 24 }}>
          <p>Work Item not found in this Epic.</p>
          <button onClick={() => { navigate(epicPath); }} style={{ background: 'none', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', color: 'var(--accent-info)', padding: '6px 10px', cursor: 'pointer' }}>back to Epic</button>
        </div>
      );
    } else {
      page = state && epic && project && (
        <BacklogItemDetail
          state={state}
          featureId={route.featureId}
          runHistories={runHistories}
          onSubscribeHistory={requestHistorySubscription}
          onBack={() => { navigate(epicPath); }}
          onStart={(featureId: string) => {
            send({ type: 'action:startFeature', featureId });
            navigate(epicPath);
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
          send={send}
          actionResults={projectActionResults}
          breadcrumb={[
            { label: 'Projects', href: '/projects' },
            { label: project.name, href: hashWithRestoredQuery(`/projects/${route.projectId}`) },
            { label: epic.title, href: epicPath },
          ]}
        />
      );
    }
  } else if (route.page === 'archived') {
    page = state && (
      <ArchivedPage
        state={state}
        send={send}
        actionResults={projectActionResults}
        archivedResults={archivedResults}
        auditTrailResults={auditTrailResults}
      />
    );
  } else {
    page = state && <ConfigPage state={state} isMobile={isMobile} send={send} />;
  }

  return (
    <ActiveProjectProvider projects={state?.projects ?? []}>
      <AppLayout
        isMobile={isMobile}
        navItems={navItems}
        activePathPrefix={activePathPrefix}
        runningCount={runningCount}
        totalTokens={totalTokens}
        unread={unread}
        notificationsOpen={notificationsOpen}
        notifications={notifications}
        projects={state?.projects ?? []}
        sidebarCollapsed={sidebarCollapsed}
        page={page}
        connectionError={connectionError}
        navigate={navigate}
        logout={logout}
        onToggleSidebar={() => { setSidebarCollapsed((collapsed) => !collapsed); }}
        onOpenNotifications={() => { setNotificationsOpen(true); setUnread(0); }}
        onCloseNotifications={() => { setNotificationsOpen(false); }}
      />
      <ToastStack items={toasts} onDismiss={dismissToast} />
    </ActiveProjectProvider>
  );
}

interface AppLayoutProps {
  isMobile: boolean; navItems: SidebarNavItem[]; activePathPrefix: string; runningCount: number; totalTokens: number; unread: number;
  notificationsOpen: boolean; notifications: NotificationListItem[]; projects: MsqWebState['projects']; sidebarCollapsed: boolean; page: React.ReactNode; connectionError: string | null;
  navigate: (path: string) => void; logout: () => void; onToggleSidebar: () => void; onOpenNotifications: () => void; onCloseNotifications: () => void;
}

function AppLayout(props: AppLayoutProps): React.JSX.Element {
  const { activeProjectId, setActiveProject, selectionInvalidated } = useActiveProject();
  const { isMobile, navItems, activePathPrefix, runningCount, totalTokens, unread, notificationsOpen, notifications, projects, sidebarCollapsed, page, connectionError, navigate, logout, onToggleSidebar, onOpenNotifications, onCloseNotifications } = props;
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
          onToggleCollapsed={onToggleSidebar}
          onNotifications={onOpenNotifications}
          onLogout={logout}
          projects={projects}
          activeProjectId={activeProjectId}
          selectionInvalidated={selectionInvalidated}
          onSelectProject={setActiveProject}
        />
      )}
      {isMobile && (
        <MobileTopBar
          live={runningCount > 0}
          notificationCount={unread}
          onNotifications={onOpenNotifications}
          onLogout={logout}
          projects={projects}
          activeProjectId={activeProjectId}
          selectionInvalidated={selectionInvalidated}
          onSelectProject={setActiveProject}
          onNavigate={navigate}
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
      <Modal open={notificationsOpen} onClose={onCloseNotifications} width={isMobile ? 320 : 440}>
        <div style={{ padding: 18 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '26px', fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '0.02em' }}>Notifications</h2>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', marginBottom: 14 }}>Last {notifications.length} events across all features</div>
          <NotificationList notifications={notifications} />
        </div>
      </Modal>
    </div>
  );
}
