import { AudioSession, LiveKitRoom, VideoTrack } from '@livekit/react-native';
import { useEffect } from 'react';

import type { MediaToken } from '../../lib/types';
import { reportMediaError, StageBody, StageProps } from './StageBody';

export default function CallStage({ media, ...props }: StageProps & { media: MediaToken }) {
  useEffect(() => {
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  return (
    <LiveKitRoom
      serverUrl={media.livekit_url}
      token={media.token}
      connect
      audio
      video={props.video}
      // adaptiveStream off so the remote video is always sent at full quality, even if the
      // view's visibility isn't detected.
      options={{ adaptiveStream: false, dynacast: true }}
      onDisconnected={props.onLeave}
      onError={(e) => {
        reportMediaError(e);
        props.onLeave();
      }}
    >
      <StageBody
        {...props}
        renderVideo={(trackRef, style, mirror) => (
          <VideoTrack
            // Remount if the underlying media track changes (resubscribe, camera restart).
            key={`${trackRef.publication.trackSid}:${trackRef.publication.track?.mediaStreamTrack?.id ?? 'none'}`}
            trackRef={trackRef}
            style={style}
            objectFit="cover"
            mirror={mirror}
            // Android stacks video surfaces by zOrder: remote video behind, own camera preview on top.
            zOrder={trackRef.participant.isLocal ? 1 : 0}
          />
        )}
      />
    </LiveKitRoom>
  );
}
