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
      options={{ adaptiveStream: { pixelDensity: 'screen' }, dynacast: true }}
      onDisconnected={props.onLeave}
      onError={(e) => {
        reportMediaError(e);
        props.onLeave();
      }}
    >
      <StageBody
        {...props}
        renderVideo={(trackRef, style, mirror) => (
          <VideoTrack key={trackRef.publication.trackSid} trackRef={trackRef} style={style} objectFit="cover" mirror={mirror} />
        )}
      />
    </LiveKitRoom>
  );
}
