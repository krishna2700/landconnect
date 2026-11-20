import { LiveKitRoom, RoomAudioRenderer, VideoTrack } from '@livekit/components-react';
import { View } from 'react-native';

import type { MediaToken } from '../../lib/types';
import { reportMediaError, StageBody, StageProps } from './StageBody';

/** Browser version: same UI, DOM <video> elements, and an audio renderer (browsers don't auto-play remote audio). */
export default function CallStage({ media, ...props }: StageProps & { media: MediaToken }) {
  return (
    <LiveKitRoom
      serverUrl={media.livekit_url}
      token={media.token}
      connect
      audio
      video={props.video}
      options={{ adaptiveStream: true, dynacast: true }}
      onDisconnected={props.onLeave}
      onError={(e) => {
        reportMediaError(e);
        props.onLeave();
      }}
      style={{ height: '100%' }}
    >
      <RoomAudioRenderer />
      <StageBody
        {...props}
        renderVideo={(trackRef, style, mirror) => (
          <View key={trackRef.publication.trackSid} style={style}>
            <VideoTrack
              trackRef={trackRef}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: mirror ? 'scaleX(-1)' : undefined }}
            />
          </View>
        )}
      />
    </LiveKitRoom>
  );
}
