import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Header } from './components/Header.js';
import { Kanban } from './components/Kanban.js';
import { Gates } from './components/Gates.js';
import { Dashboard } from './components/Dashboard.js';
import { CommandPalette } from './components/CommandPalette.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { Toasts } from './components/Toasts.js';
import { StatusBar } from './components/StatusBar.js';
import { RunDetail, DETAIL_SECTION_ORDER } from './components/RunDetail.js';
import { FeaturePreview } from './components/FeaturePreview.js';

const GROUP_ORDER = ['todo', 'execution', 'done', 'canceled'];

const WS_PATH = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

function formatNumber(n) {
  if (n == null) return '-';
  return n.toLocaleString();
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

function getRunGroup(status) {
  if (status === 'running' || status === 'blocked') return 'execution';
  if (status === 'done') return 'done';
  return 'canceled';
}

// F34 item 4: connectionState is a richer signal than the old boolean —
// distinguishes "never connected yet" from "was live, now retrying" from
// "gave up" (auth failure / intentional close), each with a since-timestamp
// so Header can show elapsed time.
function useWebSocket(token, onMessage) {
  const wsRef = useRef(null);
  // The socket reaches OPEN before the server confirms auth (state:full is
  // the actual auth ack) — sending a subscribe:* message in that window is
  // silently dropped, or on auth='token' setups can get the socket closed
  // by the server ("Not authenticated"). Deep-linking straight to a
  // ?run=/?feature= URL hits this every time, since the page's first
  // subscribe effects fire before the handshake completes. Queue sends
  // until authenticatedRef flips true, then flush.
  const authenticatedRef = useRef(false);
  const pendingRef = useRef([]);
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('never-connected');
  const [connectionSince, setConnectionSince] = useState(null);
  const [error, setError] = useState(null);
  const onMessageRef = useRef(onMessage);
  const shouldReconnectRef = useRef(true);
  const connectedTimeoutRef = useRef(null);
  const hasEverConnectedRef = useRef(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let closed = false;

    function connect() {
      if (closed || !shouldReconnectRef.current) return;
      const ws = new WebSocket(WS_PATH);
      wsRef.current = ws;
      authenticatedRef.current = false;
      pendingRef.current = [];

      function flushPending() {
        const queue = pendingRef.current;
        pendingRef.current = [];
        for (const message of queue) {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
        }
      }

      ws.addEventListener('open', () => {
        console.log('[msq web] ws open');
        ws.send(JSON.stringify({ type: 'auth', token }));
      });

      ws.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'state:full') {
            clearTimeout(connectedTimeoutRef.current);
            connectedTimeoutRef.current = setTimeout(() => setConnected(true), 500);
            hasEverConnectedRef.current = true;
            authenticatedRef.current = true;
            setConnectionState('live');
            setConnectionSince(Date.now());
            setError(null);
            flushPending();
          }
          onMessageRef.current(message);
        } catch {
          // ignore invalid JSON
        }
      });

      ws.addEventListener('close', (event) => {
        console.log('[msq web] ws close', event.code, event.reason);
        clearTimeout(connectedTimeoutRef.current);
        setConnected(false);
        authenticatedRef.current = false;
        pendingRef.current = [];
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        if (event.code === 1008) {
          shouldReconnectRef.current = false;
          setError(`WebSocket closed: ${event.reason || 'authentication failed'}`);
          setConnectionState('disconnected');
          setConnectionSince(Date.now());
          return;
        }
        if (!closed && event.code !== 1000 && shouldReconnectRef.current) {
          setConnectionState(hasEverConnectedRef.current ? 'reconnecting' : 'never-connected');
          setConnectionSince(Date.now());
          reconnectTimer = setTimeout(connect, 2000);
        } else {
          setConnectionState('disconnected');
          setConnectionSince(Date.now());
        }
      });

      ws.addEventListener('error', (event) => {
        console.log('[msq web] ws error', event);
        setError('WebSocket error');
        setConnected(false);
      });

      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      clearTimeout(connectedTimeoutRef.current);
      clearInterval(heartbeatTimer);
      if (wsRef.current) {
        wsRef.current.close(1000);
      }
    };
  }, [token]);

  const send = useMemo(
    () => (message) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN && authenticatedRef.current) {
        ws.send(JSON.stringify(message));
      } else if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        pendingRef.current.push(message);
      }
    },
    [],
  );

  return { connected, connectionState, connectionSince, error, send };
}

function useLocalOutput() {
  const [linesByRun, setLinesByRun] = useState({});

  const append = useCallback((runId, line) => {
    setLinesByRun((current) => ({
      ...current,
      [runId]: [...(current[runId] || []), line].slice(-500),
    }));
  }, []);

  const clear = useCallback((runId) => {
    setLinesByRun((current) => ({ ...current, [runId]: [] }));
  }, []);

  return { linesByRun, append, clear };
}

function updateUrlParams(params) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  window.history.pushState({}, '', url);
}

function App() {
  const [state, setState] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const [selectedColumn, setSelectedColumn] = useState('todo');
  const [selectedGateId, setSelectedGateId] = useState(null);
  const [view, setView] = useState('overview');
  const [dashboardPeriod, setDashboardPeriod] = useState(1);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailTab, setDetailTab] = useState(0);
  const [detailDense, setDetailDense] = useState(false);
  const [outputPaused, setOutputPaused] = useState(false);
  const [logsVisible, setLogsVisible] = useState(true);
  const [runDetails, setRunDetails] = useState({});
  const [runHistories, setRunHistories] = useState({});
  const [runChangesByRun, setRunChangesByRun] = useState({});
  const { linesByRun, append, clear } = useLocalOutput();

  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || prompt('Enter msq web token:') || '';
  }, []);

  // F34 item 6: apply the server-resolved theme (same BUILTIN_THEMES the TUI
  // uses, F10) as CSS custom properties instead of the previous hardcoded
  // single dark palette.
  useEffect(() => {
    const roles = state?.theme?.roles;
    if (!roles) return;
    const root = document.documentElement.style;
    root.setProperty('--text', roles.text);
    root.setProperty('--accent', roles.primary);
    root.setProperty('--accent-dim', roles.accent);
    root.setProperty('--success', roles.success);
    root.setProperty('--warning', roles.warning);
    root.setProperty('--danger', roles.error);
    root.setProperty('--muted', roles.muted);
    root.setProperty('--info', roles.focus);
  }, [state?.theme]);

  const onMessage = useCallback((message) => {
    if (message.type === 'state:full') {
      setState(message.payload);
    } else if (message.type === 'run:output') {
      append(message.payload.runId, message.payload);
    } else if (message.type === 'run:detail') {
      setRunDetails((current) => ({
        ...current,
        [message.payload.runId]: {
          taskRuns: message.payload.taskRuns,
          breakdown: message.payload.breakdown,
        },
      }));
    } else if (message.type === 'run:history') {
      setRunHistories((current) => ({ ...current, [message.payload.featureId]: message.payload.runs }));
    } else if (message.type === 'run:changes') {
      setRunChangesByRun((current) => ({ ...current, [message.payload.runId]: message.payload }));
    } else if (message.type === 'error') {
      console.error('[ws] server error:', message.payload.message);
    } else if (message.type === 'tokens:update') {
      // F34 item 3: live token telemetry on kanban cards without waiting for
      // the next full state broadcast.
      setState((current) => {
        if (!current?.runs) return current;
        const { runId, total } = message.payload;
        let changed = false;
        const runs = current.runs.map((run) => {
          if (run.runId !== runId) return run;
          changed = true;
          return { ...run, totalTokens: total };
        });
        return changed ? { ...current, runs } : current;
      });
    }
  }, [append, clear]);

  const { connected, connectionState, connectionSince, send } = useWebSocket(token, onMessage);

  // Subscribe/unsubscribe run detail and output when selected run changes
  useEffect(() => {
    if (view === 'run' && typeof selectedRunId === 'number') {
      clear(selectedRunId);
      send({ type: 'subscribe:output', runId: selectedRunId });
      send({ type: 'subscribe:runDetail', runId: selectedRunId });
      send({ type: 'subscribe:runChanges', runId: selectedRunId });
      return () => {
        send({ type: 'unsubscribe:output', runId: selectedRunId });
        send({ type: 'unsubscribe:runDetail', runId: selectedRunId });
        send({ type: 'unsubscribe:runChanges', runId: selectedRunId });
      };
    }
    return undefined;
  }, [view, selectedRunId, send]);

  // F34 item 3: kanban cards in the execution column show live output/tokens
  // even while the run detail overlay is closed, so keep every running/
  // blocked run subscribed to output regardless of which screen is active.
  // The currently open run detail manages its own subscription above, so it
  // is excluded here to avoid the two effects racing to unsubscribe it.
  const kanbanOutputRunIdsKey = useMemo(() => (state?.runs || [])
    .filter((run) => (run.status === 'running' || run.status === 'blocked') && run.runId !== selectedRunId)
    .map((run) => run.runId)
    .sort((a, b) => a - b)
    .join(','), [state?.runs, selectedRunId]);

  useEffect(() => {
    const ids = kanbanOutputRunIdsKey ? kanbanOutputRunIdsKey.split(',').map(Number) : [];
    for (const runId of ids) send({ type: 'subscribe:output', runId });
    return () => {
      for (const runId of ids) send({ type: 'unsubscribe:output', runId });
    };
  }, [kanbanOutputRunIdsKey, send]);

  // Parse URL params on initial load and browser back/forward
  useEffect(() => {
    function parseUrl() {
      const params = new URLSearchParams(window.location.search);
      const runParam = params.get('run');
      const featureParam = params.get('feature');
      const viewParam = params.get('view');

      if (runParam) {
        const runId = Number(runParam);
        if (!Number.isNaN(runId)) {
          setSelectedRunId(runId);
          setSelectedFeatureId(null);
          setView('run');
          setDetailTab(0);
          return;
        }
      }
      if (featureParam) {
        setSelectedFeatureId(featureParam);
        setSelectedRunId(null);
        setView('preview');
        return;
      }
      if (viewParam === 'dashboard') {
        setSelectedRunId(null);
        setSelectedFeatureId(null);
        setView('dashboard');
        return;
      }
      setSelectedRunId(null);
      setSelectedFeatureId(null);
      setView('overview');
    }

    parseUrl();
    window.addEventListener('popstate', parseUrl);
    return () => window.removeEventListener('popstate', parseUrl);
  }, []);

  // Update selectedColumn when run is selected and state arrives
  useEffect(() => {
    if (typeof selectedRunId === 'number' && state?.runs) {
      const run = state.runs.find((r) => r.runId === selectedRunId);
      if (run) {
        setSelectedColumn(getRunGroup(run.status));
      }
    }
  }, [selectedRunId, state?.runs]);

  const sortedRuns = useMemo(() => state?.runs || [], [state?.runs]);
  const selectedRun = useMemo(() => {
    if (typeof selectedRunId !== 'number') return null;
    return sortedRuns.find((run) => run.runId === selectedRunId) || null;
  }, [sortedRuns, selectedRunId]);

  const selectedFeature = useMemo(() => {
    if (!selectedFeatureId || !state?.featureCatalog) return null;
    return state.featureCatalog[selectedFeatureId] || null;
  }, [selectedFeatureId, state?.featureCatalog]);

  const runDetail = useMemo(() => {
    if (!selectedRun) return null;
    return runDetails[selectedRun.runId] || { taskRuns: [], breakdown: null };
  }, [selectedRun, runDetails]);

  const outputForSelected = useMemo(() => {
    if (!selectedRun) return [];
    return linesByRun[selectedRun.runId] || [];
  }, [selectedRun, linesByRun]);

  const selectedGate = useMemo(
    () => (state?.gates || []).find((gate) => gate.id === selectedGateId) || null,
    [state?.gates, selectedGateId],
  );

  // F34 item 1/2: subscribe to full run history for the selected run's
  // feature so RunDetail can surface previous attempts (workflow/tasks
  // fallback, failed-attempt banner in FeaturePreview).
  useEffect(() => {
    const featureId = selectedRun?.featureId || (view === 'preview' ? selectedFeatureId : null);
    if ((view === 'run' || view === 'preview') && featureId) {
      send({ type: 'subscribe:runHistory', featureId });
      return () => send({ type: 'unsubscribe:runHistory', featureId });
    }
    return undefined;
  }, [view, selectedRun?.featureId, selectedFeatureId, send]);

  const previousRunId = useMemo(() => {
    if (!selectedRun) return null;
    const history = runHistories[selectedRun.featureId] || [];
    const other = history.find(
      (entry) => entry.runId !== selectedRun.runId
        && (entry.status === 'done' || entry.status === 'failed' || entry.status === 'aborted'),
    );
    return other ? other.runId : null;
  }, [selectedRun, runHistories]);

  // Prefetch task-run breakdown of the most recent completed previous
  // attempt so the Workflow/Tasks tabs can fall back to it when the current
  // run has no stage data of its own yet.
  useEffect(() => {
    if (view === 'run' && typeof previousRunId === 'number') {
      send({ type: 'subscribe:runDetail', runId: previousRunId });
      return () => send({ type: 'unsubscribe:runDetail', runId: previousRunId });
    }
    return undefined;
  }, [view, previousRunId, send]);

  const previousAttemptTaskRuns = useMemo(() => {
    if (typeof previousRunId !== 'number') return [];
    return runDetails[previousRunId]?.taskRuns || [];
  }, [previousRunId, runDetails]);

  const previousAttemptInfo = useMemo(() => {
    if (typeof previousRunId !== 'number' || !selectedRun) return null;
    const entry = (runHistories[selectedRun.featureId] || []).find((run) => run.runId === previousRunId);
    return entry ? { runId: entry.runId, status: entry.status } : null;
  }, [previousRunId, runHistories, selectedRun]);

  const runChangesForSelected = useMemo(() => {
    if (!selectedRun) return null;
    return runChangesByRun[selectedRun.runId] || null;
  }, [selectedRun, runChangesByRun]);

  const doneFeatureIds = useMemo(
    () => new Set((state?.runs || []).filter((run) => run.status === 'done').map((run) => run.featureId)),
    [state?.runs],
  );

  const navigateToRun = (runId) => {
    setSelectedRunId(runId);
    setSelectedFeatureId(null);
    setView('run');
    setDetailTab(0);
    updateUrlParams({ run: runId, feature: null, view: null });
  };

  const navigateToPreview = (featureId) => {
    setSelectedFeatureId(featureId);
    setSelectedRunId(null);
    setView('preview');
    updateUrlParams({ run: null, feature: featureId, view: null });
  };

  const backToOverview = () => {
    setView('overview');
    setSelectedRunId(null);
    setSelectedFeatureId(null);
    setSelectedGateId(null);
    setPaletteOpen(false);
    setHelpOpen(false);
    updateUrlParams({ run: null, feature: null, view: null });
  };

  const handleSelectRun = (id, column) => {
    setSelectedColumn(column);
    if (column === 'todo') {
      navigateToPreview(id);
    } else {
      navigateToRun(id);
    }
  };

  const handleSelectColumn = (column) => {
    setSelectedColumn(column);
    if (column === 'todo') {
      setSelectedRunId(null);
    }
  };

  const dashboardRows = useMemo(() => {
    const days = (state?.dashboard?.periods || [])[dashboardPeriod]?.days;
    if (days == null) return state?.dashboard?.rows || [];
    const since = new Date();
    since.setDate(since.getDate() - days);
    return (state?.dashboard?.rows || []).filter((row) => new Date(row.startedAt) >= since);
  }, [state?.dashboard, dashboardPeriod]);

  const commands = useMemo(() => {
    const list = [];
    if (selectedRun?.pipelineId) {
      if (selectedRun.pipelineStatus === 'running') {
        list.push({ id: 'pause', label: 'Pause pipeline', key: 'p', action: () => send({ type: 'action:pausePipeline', pipelineId: selectedRun.pipelineId }) });
      }
      if (selectedRun.pipelineStatus === 'paused') {
        list.push({ id: 'resume', label: 'Resume pipeline', key: 'r', action: () => send({ type: 'action:resumePipeline', pipelineId: selectedRun.pipelineId }) });
      }
      if (selectedRun.pipelineStatus === 'running' || selectedRun.pipelineStatus === 'paused') {
        list.push({ id: 'abort', label: 'Abort pipeline', key: 'x', action: () => send({ type: 'action:abortPipeline', pipelineId: selectedRun.pipelineId }) });
      }
    }
    list.push({ id: 'dashboard', label: 'Toggle dashboard', key: 'd', action: () => setView((v) => (v === 'dashboard' ? 'overview' : 'dashboard')) });
    list.push({ id: 'help', label: 'Help', key: '?', action: () => setHelpOpen(true) });
    return list;
  }, [selectedRun, send]);

  useEffect(() => {
    function onKeyDown(e) {
      if (helpOpen) {
        if (e.key === '?' || e.key === 'Escape') {
          setHelpOpen(false);
        }
        return;
      }

      if (paletteOpen) {
        if (e.key === 'Escape') {
          setPaletteOpen(false);
        }
        return;
      }

      if (e.key === '?' && !paletteOpen) {
        setHelpOpen(true);
        return;
      }

      if (e.key === 'Escape') {
        if (view === 'run' || view === 'preview') {
          backToOverview();
        } else if (view === 'dashboard') {
          setView('overview');
          updateUrlParams({ view: null });
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (e.key === 'd' && !paletteOpen) {
        setView((v) => {
          const next = v === 'dashboard' ? 'overview' : 'dashboard';
          updateUrlParams({ view: next === 'dashboard' ? 'dashboard' : null, run: null, feature: null });
          return next;
        });
        return;
      }

      if (view === 'run' && selectedRun) {
        if (e.key >= '1' && e.key <= String(DETAIL_SECTION_ORDER.length)) {
          setDetailTab(Number(e.key) - 1);
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          const total = DETAIL_SECTION_ORDER.length;
          setDetailTab((t) => (e.shiftKey ? (t - 1 + total) % total : (t + 1) % total));
          return;
        }
        if (e.key === 'i') {
          setDetailDense((d) => !d);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          setOutputPaused((p) => !p);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
          e.preventDefault();
          setLogsVisible((v) => !v);
          return;
        }
      }


      if (view !== 'run' && view !== 'preview') {
        if (e.key === 'ArrowLeft') {
          const currentIndex = GROUP_ORDER.indexOf(selectedColumn);
          const prev = GROUP_ORDER[currentIndex - 1];
          if (prev) setSelectedColumn(prev);
          return;
        }
        if (e.key === 'ArrowRight') {
          const currentIndex = GROUP_ORDER.indexOf(selectedColumn);
          const next = GROUP_ORDER[currentIndex + 1];
          if (next) setSelectedColumn(next);
          return;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, selectedRun, selectedFeature, paletteOpen, helpOpen, selectedColumn, send]);

  return React.createElement(
    'div',
    { className: 'app' },
    React.createElement(Header, { state, connected, connectionState, connectionSince }),
    view === 'dashboard'
      ? React.createElement(Dashboard, {
          rows: dashboardRows,
          periods: state?.dashboard?.periods || [],
          selectedPeriod: dashboardPeriod,
          onSelectPeriod: setDashboardPeriod,
        })
      : React.createElement(
          'div',
          { className: 'main' },
          React.createElement(Kanban, {
            state,
            selectedId: selectedRunId ?? selectedFeatureId,
            selectedColumn,
            onSelectRun: handleSelectRun,
            onSelectColumn: handleSelectColumn,
            linesByRun,
          }),
          React.createElement(Gates, {
            gates: state?.gates || [],
            selectedGateId,
            onSelectGate: setSelectedGateId,
            onResolve: (gate, decision) => {
              if (gate.kind === 'gate') {
                send({ type: 'action:resolveGate', gateId: gate.id, decision });
              } else {
                const response = decision === 'approved' ? 'advance' : decision === 'skipped' ? 'hold' : 'retry';
                send({ type: 'action:resolveStageRequest', requestId: gate.id, response });
              }
              setSelectedGateId(null);
            },
            onForce: (gate) => {
              if (gate.kind === 'gate') {
                send({ type: 'action:forceResolveGate', gateId: gate.id });
              } else {
                send({ type: 'action:resolveStageRequest', requestId: gate.id, response: 'advance' });
              }
              setSelectedGateId(null);
            },
          }),
        ),
    view === 'run' && selectedRun
      ? React.createElement(RunDetail, {
          run: selectedRun,
          feature: state?.featureCatalog?.[selectedRun.featureId] || null,
          backlogSettings: state?.backlogSettings || { stageSkills: {} },
          taskRuns: runDetail.taskRuns,
          breakdown: runDetail.breakdown,
          previousAttemptTaskRuns,
          previousAttemptInfo,
          runChanges: runChangesForSelected,
          outputLines: outputForSelected,
          outputPaused,
          logsVisible,
          dense: detailDense,
          activeTab: detailTab,
          onTabChange: setDetailTab,
          onToggleDensity: () => setDetailDense((d) => !d),
          onTogglePause: () => setOutputPaused((p) => !p),
          onToggleLogs: () => setLogsVisible((v) => !v),
          onPause: () => selectedRun.pipelineId && send({ type: 'action:pausePipeline', pipelineId: selectedRun.pipelineId }),
          onResume: () => selectedRun.pipelineId && send({ type: 'action:resumePipeline', pipelineId: selectedRun.pipelineId }),
          onAbort: () => selectedRun.pipelineId && send({ type: 'action:abortPipeline', pipelineId: selectedRun.pipelineId }),
          onClose: backToOverview,
          onResolveGate: (decision) => {
            if (selectedRun.gateId != null) send({ type: 'action:resolveGate', gateId: selectedRun.gateId, decision });
          },
          onForceGate: () => {
            if (selectedRun.gateId != null) send({ type: 'action:forceResolveGate', gateId: selectedRun.gateId });
          },
          onResolveStageRequest: (response) => {
            if (selectedRun.pendingStageRequestId != null) {
              send({ type: 'action:resolveStageRequest', requestId: selectedRun.pendingStageRequestId, response });
            }
          },
        })
      : null,
    view === 'preview' && selectedFeature
      ? React.createElement(FeaturePreview, {
          feature: selectedFeature,
          settings: state?.backlogSettings || { stageSkills: {} },
          runHistory: runHistories[selectedFeature.id] || [],
          doneFeatureIds,
          tokenEstimatesByTool: state?.tokenEstimatesByTool || null,
          onStart: (overrides) => {
            send({
              type: 'action:startFeature',
              featureId: selectedFeature.id,
              ...(overrides && Object.keys(overrides).length > 0 ? { overrides } : {}),
            });
            backToOverview();
          },
          onSaveConfig: (patch) => {
            send({ type: 'action:updateFeatureConfig', featureId: selectedFeature.id, patch });
          },
          onSaveTaskConfig: (taskId, patch) => {
            send({ type: 'action:updateTaskConfig', featureId: selectedFeature.id, taskId, patch });
          },
          onClose: backToOverview,
          onOpenRun: (runId) => {
            navigateToRun(runId);
          },
        })
      : null,
    React.createElement(StatusBar, {
      view,
      selectedRun,
      selectedGate,
    }),
    React.createElement(CommandPalette, {
      commands,
      isOpen: paletteOpen,
      onClose: () => setPaletteOpen(false),
      onExecute: (cmd) => {
        cmd.action();
        setPaletteOpen(false);
      },
    }),
    React.createElement(HelpOverlay, {
      isOpen: helpOpen,
      onClose: () => setHelpOpen(false),
      shortcuts: [
        { key: '?', label: 'Open help' },
        { key: 'esc', label: 'Close / back to overview' },
        { key: 'd', label: 'Toggle dashboard' },
        { key: 'ctrl+p', label: 'Command palette' },
        { key: '← / →', label: 'Switch kanban column' },
        { key: '1-7', label: 'Jump to detail tab' },
        { key: 'tab / shift+tab', label: 'Cycle detail tabs' },
        { key: 'i', label: 'Toggle detail density' },
        { key: 'ctrl+s', label: 'Pause/resume output' },
        { key: 'ctrl+l', label: 'Toggle logs' },
      ],
    }),
    React.createElement(Toasts, { toasts: state?.notifications?.slice(0, 4) || [] }),
  );
}

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));
