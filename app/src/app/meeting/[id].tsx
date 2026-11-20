import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import CallStage from '../../components/call/CallStage';
import { Empty, Loading } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import type { MediaToken, Room } from '../../lib/types';

export default function MeetingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [media, setMedia] = useState<MediaToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.room(Number(id)), api.joinRoom(Number(id))])
      .then(([r, m]) => {
        setRoom(r);
        setMedia(m);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not join the meeting'));
  }, [id]);

  const left = useRef(false);
  const leave = useCallback(() => {
    if (left.current) return; // error + disconnect can both fire
    left.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/calls');
  }, [router]);

  if (error) return <Empty icon="videocam-off-outline" title={error} />;
  if (!room || !media) return <Loading />;

  return <CallStage media={media} mode="meeting" video title={room.title} waitingText="Waiting for others to join…" onLeave={leave} />;
}
