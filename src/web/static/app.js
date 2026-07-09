import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

const GROUP_ORDER = ['todo', 'execution', 'done', 'canceled'];
const GROUP_LABELS = {
  todo: 'TODO',
  execution: 'IN PROGRESS / BLOCKED',
  done: 'DONE',
  canceled: 'FALHA / CANCELED',
};

const WS_PATH = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

function getRunGroup(status) {
  if (status === 'running' || status === 'blocked') return 'execution';
  if (status === 'done') return 'done';
  return 'canceled';
}

function sortRunsByGroup(runs) {
  return [...runs]
    .map((run, index) => ({ run, index }))
    .sort((a, b) => {
      const orderA = GROUP_ORDER.indexOf(getRunGroup(a.run.status));
      const orderB = GROUP_ORDER.indexOf(getRunGroup(b.run.status));
      if (orderA !== orderB) return orderA - orderB;
      return a.index - b.index;
    })
    .map((entry) => entry.run);
}

function formatNumber(n) {
  if (n == null) return '-';
  return n.toLocaleString();
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

function useWebSocket(token, onMessage) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let reconnectTimer = null;
    let closed = false;

    function connect() {
      if (closed) return;
      const ws = new WebSocket(WS_PATH);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        setConnected(true);
        setError(null);
        ws.send(JSON.stringify({ type: 'auth', token }));
      });

      ws.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          onMessage(message);
        } catch {
          // ignore invalid JSON
        }
      });

      ws.addEventListener('close', (event) => {
        setConnected(false);
        if (!closed && event.code !== 1000) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      });

      ws.addEventListener('error', () => {
        setError('WebSocket error');
        setConnected(false);
      });
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close(1000);
      }
    };
  }, [token, onMessage]);

  const send = useMemo(
    () => (message) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      }
    },
    [],
  );

  return { connected, error, send };
}

function useLocalOutput() {
  const [linesByRun, setLinesByRun] = useState({});

  const append = (runId, line) => {
    setLinesByRun((current) => ({
      ...current,
      [runId]: [...(current[runId] || []), line].slice(-500),
    }));
  };

  const clear = (runId) => {
    setLinesByRun((current) => ({ ...current, [runId]: [] }));
  };

  return { linesByRun, append, clear };
}

function Header({ state, connected }) {
  const stats = state?.stats || {};
  return React.createElement(
    'header',
    { className: 'header' },
    React.createElement('h1', null, `msq web — ${state?.repoLabel || 'loading...'}`),
    React.createElement(
      'div',
      { className: 'stats' },
      React.createElement('span', null, React.createElement('strong', null, stats.executionCount || 0), ' running'),
      React.createElement('span', null, React.createElement('strong', null, stats.doneRuns || 0), ' done'),
      React.createElement('span', null, React.createElement('strong', null, stats.falhaCount || 0), ' failed'),
      React.createElement('span', null, React.createElement('strong', null, stats.totalRuns || 0), ' total'),
      React.createElement(
        'span',
        null,
        'tokens: ',
        React.createElement('strong', null, formatNumber(stats.tokenStats?.totalTokens)),
      ),
      React.createElement('span', null, connected ? 'connected' : 'offline'),
    ),
  );
}

function KanbanCard({ run, selected, onClick }) {
  return React.createElement(
    'div',
    { className: `card ${selected ? 'selected' : ''}`, onClick },
    React.createElement('div', { className: 'title' }, run.featureId),
    React.createElement(
      'div',
      { className: 'meta' },
      React.createElement('span', null, run.tool),
      React.createElement('span', null, run.status),
      run.pipelineStatus ? React.createElement('span', null, `pipeline ${run.pipelineStatus}`) : null,
      run.totalTokens != null ? React.createElement('span', null, `${formatNumber(run.totalTokens)} tok`) : null,
    ),
  );
}

function Kanban({ state, selectedRunId, selectedColumn, onSelectRun, onSelectColumn }) {
  const runs = useMemo(() => sortRunsByGroup(state?.runs || []), [state?.runs]);
  const pending = state?.pendingFeatures || [];
  const byGroup = useMemo(() => {
    const groups = { execution: [], done: [], canceled: [] };
    for (const run of runs) {
      groups[getRunGroup(run.status)].push(run);
    }
    return groups;
  }, [runs]);

  return React.createElement(
    'div',
    { className: 'columns' },
    React.createElement(
      'div',
      { className: `column ${selectedColumn === 'todo' ? 'active' : ''}`, onClick: () => onSelectColumn('todo') },
      React.createElement('h2', null, `${GROUP_LABELS.todo} (${pending.length})`),
      React.createElement(
        'div',
        { className: 'list' },
        pending.length === 0
          ? React.createElement('div', { className: 'empty' }, 'No pending features')
          : pending.map((feature) =>
              React.createElement(
                'div',
                {
                  key: feature.id,
                  className: `card ${selectedRunId === feature.id ? 'selected' : ''}`,
                  onClick: (e) => {
                    e.stopPropagation();
                    onSelectRun(feature.id, 'todo');
                  },
                },
                React.createElement('div', { className: 'title' }, feature.id),
                React.createElement('div', { className: 'meta' }, React.createElement('span', null, feature.title)),
              ),
            ),
      ),
    ),
    ...['execution', 'done', 'canceled'].map((group) =>
      React.createElement(
        'div',
        {
          key: group,
          className: `column ${selectedColumn === group ? 'active' : ''}`,
          onClick: () => onSelectColumn(group),
        },
        React.createElement('h2', null, `${GROUP_LABELS[group]} (${byGroup[group].length})`),
        React.createElement(
          'div',
          { className: 'list' },
          byGroup[group].length === 0
            ? React.createElement('div', { className: 'empty' }, 'No runs')
            : byGroup[group].map((run) =>
                React.createElement(KanbanCard, {
                  key: run.runId,
                  run,
                  selected: selectedRunId === run.runId,
                  onClick: (e) => {
                    e.stopPropagation();
                    onSelectRun(run.runId, group);
                  },
                }),
              ),
        ),
      ),
    ),
  );
}

function Gates({ gates, selectedGateId, onSelectGate, onResolve, onForce }) {
  return React.createElement(
    'aside',
    { className: 'gates' },
    React.createElement('h2', null, `Gates (${gates.length})`),
    React.createElement(
      'div',
      { className: 'list' },
      gates.length === 0
        ? React.createElement('div', { className: 'empty' }, 'No pending gates')
        : gates.map((gate) =>
            React.createElement(
              'div',
              {
                key: gate.id,
                className: `gate ${selectedGateId === gate.id ? 'selected' : ''}`,
                onClick: () => onSelectGate(gate.id),
              },
              React.createElement('div', { className: 'feature' }, gate.featureId),
              React.createElement('div', { className: 'meta' }, gate.kind),
              gate.prompt ? React.createElement('div', { className: 'prompt' }, gate.prompt) : null,
              selectedGateId === gate.id
                ? React.createElement(
                    'div',
                    { className: 'actions' },
                    React.createElement('button', { onClick: () => onResolve(gate, 'approved') }, 'approve'),
                    gate.kind === 'gate'
                      ? React.createElement('button', { onClick: () => onResolve(gate, 'skipped') }, 'skip')
                      : null,
                    gate.kind === 'gate'
                      ? React.createElement('button', { onClick: () => onResolve(gate, 'retried') }, 'retry')
                      : null,
                    React.createElement(
                      'button',
                      { className: 'primary', onClick: () => onForce(gate) },
                      'force',
                    ),
                  )
                : null,
            ),
          ),
    ),
  );
}

function RunDetail({ run, outputLines, taskRuns, onPause, onResume, onAbort, onSubscribe, onUnsubscribe }) {
  useEffect(() => {
    if (run?.runId) {
      onSubscribe(run.runId);
      return () => onUnsubscribe(run.runId);
    }
    return undefined;
  }, [run?.runId, onSubscribe, onUnsubscribe]);

  if (!run) {
    return React.createElement(
      'div',
      { className: 'run-detail' },
      React.createElement('div', { className: 'empty' }, 'Select a run to view details'),
    );
  }

  const canPause = run.pipelineId && run.pipelineStatus === 'running';
  const canResume = run.pipelineId && run.pipelineStatus === 'paused';
  const canAbort = run.pipelineId && (run.pipelineStatus === 'running' || run.pipelineStatus === 'paused');

  return React.createElement(
    'div',
    { className: 'run-detail' },
    React.createElement(
      'header',
      null,
      React.createElement('div', null, React.createElement('strong', null, run.featureId), ` — ${run.status}`),
      React.createElement(
        'div',
        null,
        canPause ? React.createElement('button', { onClick: () => onPause(run.pipelineId) }, 'pause') : null,
        canResume ? React.createElement('button', { onClick: () => onResume(run.pipelineId) }, 'resume') : null,
        canAbort
          ? React.createElement(
              'button',
              { className: 'danger', onClick: () => onAbort(run.pipelineId, run.featureId) },
              'abort',
            )
          : null,
      ),
    ),
    React.createElement(
      'div',
      { className: 'body' },
      React.createElement(
        'div',
        { className: 'meta' },
        React.createElement('p', null, `tool: ${run.tool}`),
        React.createElement('p', null, `started: ${formatDate(run.startedAt)}`),
        run.endedAt ? React.createElement('p', null, `ended: ${formatDate(run.endedAt)}`) : null,
        run.totalTokens != null ? React.createElement('p', null, `tokens: ${formatNumber(run.totalTokens)}`) : null,
        run.pipelineCurrentStage ? React.createElement('p', null, `stage: ${run.pipelineCurrentStage}`) : null,
      ),
      React.createElement('h3', null, 'Tasks'),
      React.createElement(
        'ul',
        { className: 'task-list' },
        taskRuns.length === 0
          ? React.createElement('li', null, 'No task runs recorded')
          : taskRuns.map((task) =>
              React.createElement(
                'li',
                { key: task.id },
                `${task.taskId}: ${task.title} — ${task.status}`,
                task.totalTokens ? ` (${formatNumber(task.totalTokens)} tok)` : '',
              ),
            ),
      ),
      React.createElement('h3', null, 'Output'),
      React.createElement(
        'pre',
        { className: 'logs' },
        outputLines.length === 0 ? 'No output yet.' : outputLines.join('\n'),
      ),
    ),
  );
}

function Dashboard({ rows, periods, selectedPeriod, onSelectPeriod }) {
  return React.createElement(
    'div',
    { className: 'dashboard' },
    React.createElement(
      'div',
      { style: { marginBottom: 12 } },
      periods.map((period, index) =>
        React.createElement(
          'button',
          {
            key: period.label,
            className: selectedPeriod === index ? 'primary' : '',
            style: { marginRight: 8 },
            onClick: () => onSelectPeriod(index),
          },
          period.label,
        ),
      ),
    ),
    React.createElement(
      'table',
      { style: { width: '100%', borderCollapse: 'collapse' } },
      React.createElement(
        'thead',
        null,
        React.createElement(
          'tr',
          null,
          React.createElement('th', { style: { textAlign: 'left' } }, 'feature'),
          React.createElement('th', { style: { textAlign: 'left' } }, 'tool'),
          React.createElement('th', { style: { textAlign: 'left' } }, 'status'),
          React.createElement('th', { style: { textAlign: 'right' } }, 'tokens'),
          React.createElement('th', { style: { textAlign: 'left' } }, 'started'),
        ),
      ),
      React.createElement(
        'tbody',
        null,
        rows.length === 0
          ? React.createElement(
              'tr',
              null,
              React.createElement('td', { colSpan: 5, className: 'empty' }, 'No runs for this period'),
            )
          : rows.map((row) =>
              React.createElement(
                'tr',
                { key: row.id },
                React.createElement('td', null, row.featureId),
                React.createElement('td', null, row.tool),
                React.createElement('td', null, row.status),
                React.createElement('td', { style: { textAlign: 'right' } }, formatNumber(row.totalTokens)),
                React.createElement('td', null, formatDate(row.startedAt)),
              ),
            ),
      ),
    ),
  );
}

function CommandPalette({ commands, isOpen, onClose, onExecute }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return commands.filter((cmd) => cmd.label.toLowerCase().includes(q) || cmd.key.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    function onKeyDown(e) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[selected];
        if (cmd) onExecute(cmd);
        return;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, filtered, selected, onClose, onExecute]);

  if (!isOpen) return null;

  return React.createElement(
    'div',
    { className: 'palette-overlay', onClick: onClose },
    React.createElement(
      'div',
      { className: 'palette', onClick: (e) => e.stopPropagation() },
      React.createElement('input', {
        ref: inputRef,
        value: query,
        onChange: (e) => {
          setQuery(e.target.value);
          setSelected(0);
        },
        placeholder: 'Type a command...',
      }),
      React.createElement(
        'div',
        { className: 'results' },
        filtered.map((cmd, index) =>
          React.createElement(
            'div',
            {
              key: cmd.id,
              className: `result ${selected === index ? 'selected' : ''}`,
              onClick: () => onExecute(cmd),
            },
            React.createElement('span', null, cmd.label),
            React.createElement('span', { className: 'shortcut' }, cmd.key),
          ),
        ),
      ),
    ),
  );
}

function HelpOverlay({ isOpen, onClose, shortcuts }) {
  if (!isOpen) return null;
  return React.createElement(
    'div',
    { className: 'help-overlay', onClick: onClose },
    React.createElement(
      'div',
      { className: 'help', onClick: (e) => e.stopPropagation() },
      React.createElement('h2', null, 'Keyboard shortcuts'),
      React.createElement(
        'table',
        null,
        React.createElement(
          'tbody',
          null,
          shortcuts.map((shortcut) =>
            React.createElement(
              'tr',
              { key: shortcut.key + shortcut.label },
              React.createElement('td', null, shortcut.key),
              React.createElement('td', null, shortcut.label),
            ),
          ),
        ),
      ),
    ),
  );
}

function Toasts({ toasts }) {
  return React.createElement(
    'div',
    { className: 'toasts' },
    toasts.map((toast) =>
      React.createElement('div', { key: toast.id, className: `toast ${toast.type}` }, toast.message),
    ),
  );
}

function App() {
  const [state, setState] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [selectedColumn, setSelectedColumn] = useState('todo');
  const [selectedGateId, setSelectedGateId] = useState(null);
  const [view, setView] = useState('overview');
  const [dashboardPeriod, setDashboardPeriod] = useState(1);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { linesByRun, append, clear } = useLocalOutput();
  const outputForSelected = selectedRunId && typeof selectedRunId === 'number' ? linesByRun[selectedRunId] || [] : [];

  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || prompt('Enter msq web token:') || '';
  }, []);

  const onMessage = (message) => {
    if (message.type === 'state:full') {
      setState(message.payload);
    } else if (message.type === 'run:output') {
      append(message.payload.runId, message.payload.line);
    } else if (message.type === 'ui:notice' || message.type === 'ui:info') {
      // handled by state notifications for now
    }
  };

  const { connected, send } = useWebSocket(token, onMessage);

  const sortedRuns = useMemo(() => sortRunsByGroup(state?.runs || []), [state?.runs]);
  const selectedRun = useMemo(() => {
    if (selectedColumn === 'todo') return null;
    return sortedRuns.find((run) => run.runId === selectedRunId) || null;
  }, [sortedRuns, selectedRunId, selectedColumn]);

  const taskRuns = useMemo(() => {
    if (!selectedRun) return [];
    return state?.runningTasks?.filter((task) => task.runId === selectedRun.runId) || [];
  }, [selectedRun, state?.runningTasks]);

  const selectedGate = useMemo(
    () => (state?.gates || []).find((gate) => gate.id === selectedGateId) || null,
    [state?.gates, selectedGateId],
  );

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
      if (e.key === '?' && !paletteOpen && !helpOpen) {
        setHelpOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        setHelpOpen(false);
        setPaletteOpen(false);
        if (view !== 'overview') setView('overview');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (e.key === 'd' && !paletteOpen && !helpOpen) {
        setView((v) => (v === 'dashboard' ? 'overview' : 'dashboard'));
        return;
      }
      if (e.key === 'ArrowLeft' && !paletteOpen && !helpOpen) {
        const currentIndex = GROUP_ORDER.indexOf(selectedColumn);
        const prev = GROUP_ORDER[currentIndex - 1];
        if (prev) setSelectedColumn(prev);
        return;
      }
      if (e.key === 'ArrowRight' && !paletteOpen && !helpOpen) {
        const currentIndex = GROUP_ORDER.indexOf(selectedColumn);
        const next = GROUP_ORDER[currentIndex + 1];
        if (next) setSelectedColumn(next);
        return;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paletteOpen, helpOpen, view, selectedColumn]);

  const handleSelectRun = (id, column) => {
    setSelectedColumn(column);
    setSelectedRunId(id);
    if (column !== 'todo') setView('run');
  };

  const handleSelectColumn = (column) => {
    setSelectedColumn(column);
    if (column === 'todo') {
      setView('overview');
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

  return React.createElement(
    'div',
    { className: 'app' },
    React.createElement(Header, { state, connected }),
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
            selectedRunId,
            selectedColumn,
            onSelectRun: handleSelectRun,
            onSelectColumn: handleSelectColumn,
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
          view === 'run'
            ? React.createElement(RunDetail, {
                run: selectedRun,
                outputLines: outputForSelected,
                taskRuns,
                onPause: (pipelineId) => send({ type: 'action:pausePipeline', pipelineId }),
                onResume: (pipelineId) => send({ type: 'action:resumePipeline', pipelineId }),
                onAbort: (pipelineId) => send({ type: 'action:abortPipeline', pipelineId }),
                onSubscribe: (runId) => {
                  clear(runId);
                  send({ type: 'subscribe:output', runId });
                },
                onUnsubscribe: (runId) => send({ type: 'unsubscribe:output', runId }),
              })
            : null,
        ),
    React.createElement(
      'footer',
      { className: 'status-bar' },
      React.createElement('span', null, view === 'overview' ? 'overview' : view),
      React.createElement(
        'span',
        null,
        selectedRun ? `${selectedRun.featureId} ${selectedRun.status}` : selectedGate ? `${selectedGate.featureId} gate` : '',
      ),
    ),
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
      ],
    }),
    React.createElement(Toasts, { toasts: state?.notifications?.slice(0, 4) || [] }),
  );
}

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));
