import { useRouter } from 'expo-router';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Vibration } from 'react-native';

import { api, ApiError } from './api';
import { useRealtime, useRealtimeEvent } from './realtime';
import type { Call, CallJoin, CallKind } from './types';

const FINISHED = new Set(['rejected', 'missed', 'cancelled', 'ended']);

interface CallsValue {
  incoming: Call | null;
  active: CallJoin | null;
  startCall: (conversationId: number, kind: CallKind) => Promise<void>;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
  hangUp: () => Promise<void>;
}

const CallsContext = createContext<CallsValue | null>(null);

function showError(e: unknown) {
  const msg = e instanceof ApiError ? e.message : 'Something went wrong';
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert("Couldn't connect the call", msg);
}

export function CallsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { connected } = useRealtime();
  const [incoming, setIncoming] = useState<Call | null>(null);
  const [active, setActive] = useState<CallJoin | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  // Ring pattern while a call is incoming (Android/iOS vibrate; no-op on web).
  useEffect(() => {
    if (!incoming || Platform.OS === 'web') return;
    Vibration.vibrate([0, 800, 1200], true);
    return () => Vibration.cancel();
  }, [incoming]);

  // A call may have started ringing while the socket was reconnecting.
  useEffect(() => {
    if (!connected) return;
    api.ringingCall().then((c) => c && !activeRef.current && setIncoming(c)).catch(() => {});
  }, [connected]);

  useRealtimeEvent('call_incoming', ({ call }: { call: Call }) => {
    if (activeRef.current) return; // server already rejects busy users; belt and braces
    setIncoming(call);
  });

  useRealtimeEvent('call_updated', ({ call }: { call: Call }) => {
    setIncoming((cur) => (cur && cur.id === call.id && call.status !== 'ringing' ? null : cur));
    setActive((cur) => {
      if (!cur || cur.call.id !== call.id) return cur;
      return FINISHED.has(call.status) ? null : { ...cur, call };
    });
  });

  const startCall = useCallback(
    async (conversationId: number, kind: CallKind) => {
      try {
        const join = await api.startCall(conversationId, kind);
        setActive(join);
        router.push('/call');
      } catch (e) {
        showError(e);
      }
    },
    [router],
  );

  const accept = useCallback(async () => {
    if (!incoming) return;
    const call = incoming;
    setIncoming(null);
    try {
      const join = await api.acceptCall(call.id);
      setActive(join);
      router.push('/call');
    } catch (e) {
      showError(e);
    }
  }, [incoming, router]);

  const reject = useCallback(async () => {
    if (!incoming) return;
    const call = incoming;
    setIncoming(null);
    await api.rejectCall(call.id).catch(() => {});
  }, [incoming]);

  const hangUp = useCallback(async () => {
    const cur = activeRef.current;
    setActive(null);
    if (cur) await api.endCall(cur.call.id).catch(() => {});
  }, []);

  const value = useMemo(() => ({ incoming, active, startCall, accept, reject, hangUp }), [
    incoming,
    active,
    startCall,
    accept,
    reject,
    hangUp,
  ]);
  return <CallsContext.Provider value={value}>{children}</CallsContext.Provider>;
}

export function useCalls() {
  const ctx = useContext(CallsContext);
  if (!ctx) throw new Error('useCalls must be used inside CallsProvider');
  return ctx;
}
