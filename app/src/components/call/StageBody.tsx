import { Ionicons } from '@expo/vector-icons';
import {
  isTrackReference,
  TrackReference,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import { LocalVideoTrack, RoomEvent, Track } from 'livekit-client';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors } from '../../lib/theme';
import { Avatar } from '../ui';

export interface StageProps {
  /** 1:1 call ends when the other person leaves; a meeting room doesn't. */
  mode: 'call' | 'meeting';
  video: boolean;
  title: string;
  /** Shown under the title while nobody else is in the room, e.g. "Ringing…". */
  waitingText: string;
  onLeave: () => void;
}

/** Called when the media server can't be reached or camera/mic access fails. */
export function reportMediaError(error: Error) {
  const msg = /permission|NotAllowed/i.test(error.message)
    ? 'LandConnect needs camera and microphone access for calls. Allow it in settings and try again.'
    : "Couldn't connect the call audio/video. Check your connection and try again.";
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert('Call failed', msg);
}

export type RenderVideo =(trackRef: TrackReference, style: ViewStyle, mirror: boolean) => ReactNode;

function useElapsed(running: boolean) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

export function StageBody({ mode, video, title, waitingText, onLeave, renderVideo }: StageProps & { renderVideo: RenderVideo }) {
  const room = useRoomContext();
  const remotes = useRemoteParticipants();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const peerJoined = useRef(false);
  const elapsed = useElapsed(remotes.length > 0);

  if (remotes.length > 0) peerJoined.current = true;

  // In a 1:1 call, the other side leaving means the call is over.
  useEffect(() => {
    if (mode !== 'call') return;
    const onGone = () => {
      if (peerJoined.current && room.remoteParticipants.size === 0) onLeave();
    };
    room.on(RoomEvent.ParticipantDisconnected, onGone);
    return () => {
      room.off(RoomEvent.ParticipantDisconnected, onGone);
    };
  }, [room, mode, onLeave]);

  const flipCamera = async () => {
    const pub = localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (!track) return;
    const next = facing === 'user' ? 'environment' : 'user';
    await track.restartTrack({ facingMode: next });
    setFacing(next);
  };

  const local = tracks.find((t) => t.participant.isLocal && isTrackReference(t)) as TrackReference | undefined;
  const remoteVideos = tracks.filter(
    (t) => !t.participant.isLocal && isTrackReference(t) && !t.publication.isMuted,
  ) as TrackReference[];
  const showLocal = video && isCameraEnabled && local && !local.publication.isMuted;

  const header = (
    <View style={styles.header}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.subtitle}>
        {remotes.length === 0 ? waitingText : mode === 'meeting' ? `${remotes.length + 1} in meeting · ${elapsed}` : elapsed}
      </Text>
    </View>
  );

  return (
    <View style={styles.root}>
      {remoteVideos.length === 0 ? (
        <View style={styles.center}>
          {remotes.length === 0 ? (
            <Avatar name={title} size={120} />
          ) : (
            <View style={styles.people}>
              {remotes.map((p) => (
                <View key={p.identity} style={{ alignItems: 'center', gap: 6 }}>
                  <Avatar name={p.name || p.identity} size={remotes.length > 1 ? 72 : 120} />
                  {remotes.length > 1 || mode === 'meeting' ? <Text style={styles.name}>{p.name}</Text> : null}
                </View>
              ))}
            </View>
          )}
        </View>
      ) : remoteVideos.length === 1 ? (
        renderVideo(remoteVideos[0], StyleSheet.absoluteFill as ViewStyle, false)
      ) : (
        <View style={styles.grid}>
          {remoteVideos.map((t) => (
            <View key={t.publication.trackSid} style={styles.gridCell}>
              {renderVideo(t, StyleSheet.absoluteFill as ViewStyle, false)}
              <Text style={styles.gridName}>{t.participant.name}</Text>
            </View>
          ))}
        </View>
      )}

      {header}

      {showLocal ? <View style={styles.pip}>{renderVideo(local!, StyleSheet.absoluteFill as ViewStyle, facing === 'user')}</View> : null}

      <View style={styles.controls}>
        {video ? (
          <>
            <Control icon="camera-reverse" label="Flip" onPress={flipCamera} disabled={!isCameraEnabled} />
            <Control
              icon={isCameraEnabled ? 'videocam' : 'videocam-off'}
              label={isCameraEnabled ? 'Camera' : 'Camera off'}
              onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
              active={!isCameraEnabled}
            />
          </>
        ) : null}
        <Control
          icon={isMicrophoneEnabled ? 'mic' : 'mic-off'}
          label={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
          onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
          active={!isMicrophoneEnabled}
        />
        <Pressable accessibilityLabel="End call" onPress={onLeave} style={[styles.ctrl, { backgroundColor: colors.danger }]}>
          <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
      </View>
    </View>
  );
}

function Control({
  icon,
  label,
  onPress,
  active,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={[styles.ctrl, active && { backgroundColor: '#fff' }, disabled && { opacity: 0.4 }]}
    >
      <Ionicons name={icon} size={26} color={active ? '#111' : '#fff'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B141A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, justifyContent: 'center', padding: 24 },
  name: { color: '#fff', fontWeight: '600' },
  header: { position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 },
  title: { color: '#fff', fontSize: 24, fontWeight: '600', textShadowColor: '#0008', textShadowRadius: 6 },
  subtitle: { color: '#E9EDEF', fontSize: 15, marginTop: 6, textShadowColor: '#0008', textShadowRadius: 6 },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { width: '50%', height: '50%', borderWidth: 1, borderColor: '#0B141A' },
  gridName: { position: 'absolute', left: 8, bottom: 8, color: '#fff', fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 },
  pip: {
    position: 'absolute',
    right: 16,
    bottom: 140,
    width: 110,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#ffffff55',
    backgroundColor: '#222',
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 24,
    paddingBottom: 40,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    backgroundColor: '#1F2C34',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  ctrl: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffffff26', alignItems: 'center', justifyContent: 'center' },
});
