import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import CallStage from '../components/call/CallStage';
import { useCalls } from '../lib/calls';
import { useMe } from '../lib/session';

export default function CallScreen() {
  const me = useMe();
  const router = useRouter();
  const { active, hangUp } = useCalls();
  // Keep the last call so the screen can render one more frame while it closes.
  const last = useRef(active);
  if (active) last.current = active;

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // The other side declined, cancelled or hung up: the provider clears `active`.
  useEffect(() => {
    if (!active) close();
  }, [active, close]);

  const leave = useCallback(async () => {
    await hangUp();
  }, [hangUp]);

  const join = active ?? last.current;
  if (!join) return null;
  const { call, media } = join;
  const other = call.caller.id === me.id ? call.callee : call.caller;
  const waiting = call.status === 'ringing' ? 'Ringing…' : 'Connecting…';

  return (
    <CallStage
      media={media}
      mode="call"
      video={call.kind === 'video'}
      title={other.name}
      waitingText={waiting}
      onLeave={leave}
    />
  );
}
