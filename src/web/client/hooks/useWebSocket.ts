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

/** The socket reaches OPEN before the server confirms auth (state:full is the
 * actual auth ack) — sending a subscribe:* message in that window is silently
 * dropped, or on auth='token' setups can get the socket closed by the server.
 * Queue sends until authenticatedRef flips true, then flush. */
export function useWebSocket(token: string, onMessage: (message: WebSocketServerMessage) => void): UseWebSocketResult {
  const wsRef = useRef<WebSocket | null>(null);
  const authenticatedRef = useRef(false);
  const pendingRef = useRef<WebSocketClientMessage[]>([]);
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

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'auth', token } satisfies WebSocketClientMessage));
      });

      ws.addEventListener('message', (event: MessageEvent<string>) => {
        try {
          const message = JSON.parse(event.data) as WebSocketServerMessage;
          if (message.type === 'state:full') {
            clearTimeout(connectedTimeoutRef.current);
            connectedTimeoutRef.current = setTimeout(() => { setConnected(true); }, 500);
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

      ws.addEventListener('close', (event: CloseEvent) => {
        clearTimeout(connectedTimeoutRef.current);
        setConnected(false);
        authenticatedRef.current = false;
        pendingRef.current = [];
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
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
  }, [token]);

  const send = useMemo(
    () => (message: WebSocketClientMessage): void => {
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
