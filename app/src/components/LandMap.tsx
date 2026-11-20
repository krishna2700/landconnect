import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { buildMapHtml, MapProps } from './mapHtml';

export type { MapMarker } from './mapHtml';

export default function LandMap(props: MapProps) {
  const { markers, center, zoom, pickable, height = 220 } = props;
  // Rebuild the page only when what's drawn changes, not on every parent render.
  const html = useMemo(
    () => buildMapHtml({ markers, center, zoom, pickable }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(markers), pickable, zoom, pickable ? null : JSON.stringify(center)],
  );
  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        nestedScrollEnabled
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'pick') props.onPick?.({ lat: msg.lat, lng: msg.lng });
            if (msg.type === 'marker') props.onMarkerPress?.(msg.id);
          } catch {
            /* ignore */
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#dde' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
