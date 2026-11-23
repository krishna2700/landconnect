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
      // adaptiveStream off: a 1:1 call always shows the remote video full screen, and adaptive
      // streaming would drop it to the lowest layer whenever it misjudges the element's size.
      options={{ adaptiveStream: false, dynacast: true }}
      onDisconnected={props.onLeave}
      onError={(e) => {
        reportMediaError(e);
        props.onLeave();
      }}
      // LiveKitRoom renders a plain <div>; it must fill the screen and be a flex column,
      // or StageBody's flex:1 root collapses to 0px and remote video is invisible.
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}
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
