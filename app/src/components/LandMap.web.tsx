import { createElement, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { buildMapHtml, MapProps } from './mapHtml';

export type { MapMarker } from './mapHtml';

export default function LandMap(props: MapProps) {
  const { markers, center, zoom, pickable, height = 220 } = props;
  const frame = useRef<HTMLIFrameElement | null>(null);
  const handlers = useRef(props);
  handlers.current = props;

  const html = useMemo(
    () => buildMapHtml({ markers, center, zoom, pickable }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(markers), pickable, zoom, pickable ? null : JSON.stringify(center)],
  );

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'pick') handlers.current.onPick?.({ lat: msg.lat, lng: msg.lng });
        if (msg.type === 'marker') handlers.current.onMarkerPress?.(msg.id);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <View style={[styles.wrap, { height }]}>
      {createElement('iframe', {
        ref: frame,
        srcDoc: html,
        style: { border: 0, width: '100%', height: '100%' },
        title: 'Map',
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#dde' },
});
