import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { WS_URL } from './api';

type Handler = (data: any) => void;

interface RealtimeValue {
  connected: boolean;
  on: (event: string, handler: Handler) => () => void;
  send: (event: string, payload?: Record<string, unknown>) => void;
}

const RealtimeContext = createContext<RealtimeValue | null>(null);

/**
 * One WebSocket per signed-in app. Reconnects with backoff, pings every 25 s so
 * proxies (Render) don't drop it, and reconnects when the app returns to the foreground.
 */
export function RealtimeProvider({ token, children }: { token: string | null; children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const handlers = useRef(new Map<string, Set<Handler>>());
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;
    let closed = false;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      socket.current = ws;
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        emit('connected', null);
        pingTimer = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ event: 'ping' })), 25000);
      };
      ws.onmessage = (e) => {
        try {
          const { event, data } = JSON.parse(String(e.data));
          emit(event, data);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = (e) => {
        setConnected(false);
        clearInterval(pingTimer);
        if (closed || e.code === 4401) return; // 4401 = token rejected
        retryTimer = setTimeout(connect, Math.min(15000, 1000 * 2 ** retry++));
      };
      ws.onerror = () => ws.close();
    };

    const emit = (event: string, data: unknown) => handlers.current.get(event)?.forEach((h) => h(data));

    connect();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && socket.current?.readyState !== 1) {
        clearTimeout(retryTimer);
        socket.current?.close();
        connect();
      }
    });
    return () => {
      closed = true;
      sub.remove();
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      socket.current?.close();
      socket.current = null;
    };
  }, [token]);

  const value = useMemo<RealtimeValue>(
    () => ({
      connected,
      on: (event, handler) => {
        if (!handlers.current.has(event)) handlers.current.set(event, new Set());
        handlers.current.get(event)!.add(handler);
        return () => handlers.current.get(event)?.delete(handler);
      },
      send: (event, payload = {}) => {
        if (socket.current?.readyState === 1) socket.current.send(JSON.stringify({ event, ...payload }));
      },
    }),
    [connected],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside RealtimeProvider');
  return ctx;
}

/** Subscribe to a server event for the lifetime of a component. */
export function useRealtimeEvent(event: string, handler: Handler) {
  const { on } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => on(event, (d) => ref.current(d)), [on, event]);
}
