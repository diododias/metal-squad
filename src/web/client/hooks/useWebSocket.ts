import { useEffect, useMemo, useRef, useState } from 'react';
import type { WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

export type ConnectionState = 'never-connected' | 'live' | 'reconnecting' | 'disconnected';

const wsPath = (): string => `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

export interface UseWebSocketResult {
  connected: boolean;
  connectionState: ConnectionState;
  connectionSince: number | null;
  error: string | null;
  send: (message: WebSocketClientMessage) => void;
}

/** Server subscriptions are per-connection state: a reconnect gets a fresh
 * client on the server with no subscriptions, but mounted pages only send
 * subscribe:* on mount — so replay must live here. Keyed by kind+id so an
 * unsubscribe cancels its matching subscribe even while disconnected. */
export function subscriptionKey(message: WebSocketClientMessage): string | null {
  const match = /^(?:un)?subscribe:(.+)$/.exec(message.type);
  if (!match) return null;
  const id = 'runId' in message ? message.runId : 'featureId' in message ? message.featureId : '';
  return `${match[1] ?? ''}:${String(id)}`;
}

/** Authentication happens at the WebSocket upgrade via the msq_session
 * cookie set by GET /auth (F51) — the client never holds a credential. The
 * server's state:full is still the auth ack: sending a subscribe:* message
 * before it is silently dropped. Queue sends until authenticatedRef flips
 * true, then flush. Active subscriptions are tracked separately and replayed
 * on every auth ack so a reconnect restores them (the server-side
 * subscription set dies with the old connection). */
export function useWebSocket(onMessage: (message: WebSocketServerMessage) => void): UseWebSocketResult {
  const wsRef = useRef<WebSocket | null>(null);
  const authenticatedRef = useRef(false);
  const pendingRef = useRef<WebSocketClientMessage[]>([]);
  const subscriptionsRef = useRef(new Map<string, WebSocketClientMessage>());
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('never-connected');
  const [connectionSince, setConnectionSince] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onMessageRef = useRef(onMessage);
  const shouldReconnectRef = useRef(true);
  const connectedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasEverConnectedRef = useRef(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    function connect(): void {
      if (closed || !shouldReconnectRef.current) return;
      const ws = new WebSocket(wsPath());
      wsRef.current = ws;
      authenticatedRef.current = false;
      pendingRef.current = [];

      function flushPending(): void {
        const queue = pendingRef.current;
        pendingRef.current = [];
        for (const message of queue) {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
        }
      }

      ws.addEventListener('message', (event: MessageEvent<string>) => {
        try {
          const message = JSON.parse(event.data) as WebSocketServerMessage;
          if (message.type === 'state:full') {
            clearTimeout(connectedTimeoutRef.current);
            connectedTimeoutRef.current = setTimeout(() => { setConnected(true); }, 500);
            hasEverConnectedRef.current = true;
            const isAuthAck = !authenticatedRef.current;
            authenticatedRef.current = true;
            setConnectionState('live');
            setConnectionSince(Date.now());
            setError(null);
            if (isAuthAck) {
              flushPending();
              for (const subscription of subscriptionsRef.current.values()) {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(subscription));
              }
            }
          }
          onMessageRef.current(message);
        } catch {
          // ignore invalid JSON
        }
      });

      ws.addEventListener('close', (event: CloseEvent) => {
        clearTimeout(connectedTimeoutRef.current);
        setConnected(false);
        authenticatedRef.current = false;
        pendingRef.current = [];
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
        if (event.code === 1008) {
          shouldReconnectRef.current = false;
          setError(`${event.reason || 'authentication failed'} — open the login URL printed by \`msq web\``);
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

      ws.addEventListener('error', () => {
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

    return (): void => {
      closed = true;
      clearTimeout(reconnectTimer);
      clearTimeout(connectedTimeoutRef.current);
      clearInterval(heartbeatTimer);
      wsRef.current?.close(1000);
    };
    // The socket carries no client-side credential; connect once per mount.
  }, []);

  const send = useMemo(
    () => (message: WebSocketClientMessage): void => {
      const key = subscriptionKey(message);
      if (key) {
        // Subscriptions are replayed from the map on auth, so they never go
        // through the pending queue; an unsubscribe while disconnected just
        // cancels the replay (the dead server connection has no state to undo).
        if (message.type.startsWith('subscribe:')) subscriptionsRef.current.set(key, message);
        else subscriptionsRef.current.delete(key);
      }
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN && authenticatedRef.current) {
        ws.send(JSON.stringify(message));
      } else if (!key && ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        pendingRef.current.push(message);
      }
    },
    [],
  );

  return { connected, connectionState, connectionSince, error, send };
}
