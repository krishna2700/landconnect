export interface MapMarker {
  id: number;
  lat: number;
  lng: number;
  label: string;
  approximate?: boolean;
}

export interface MapProps {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  /** When true, tapping the map moves a single draggable pin and calls onPick. */
  pickable?: boolean;
  onPick?: (p: { lat: number; lng: number }) => void;
  onMarkerPress?: (id: number) => void;
  height?: number;
}

/**
 * Self-contained Leaflet + OpenStreetMap page. No API key is needed, so the same
 * map works in the APK and on the web. It talks to React Native via postMessage.
 */
export function buildMapHtml({ markers, center, zoom, pickable }: MapProps): string {
  const c = center ?? (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : { lat: 12.9716, lng: 77.5946 });
  const config = JSON.stringify({ markers, center: c, zoom: zoom ?? (markers.length > 1 ? 7 : 13), pickable: !!pickable });
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;width:100%}.leaflet-popup-content{font:600 13px system-ui;margin:8px 10px}</style>
</head><body><div id="m"></div><script>
var cfg=${config};
function post(msg){var s=JSON.stringify(msg);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s)}else{parent.postMessage(s,'*')}}
var map=L.map('m',{zoomControl:true,attributionControl:true}).setView([cfg.center.lat,cfg.center.lng],cfg.zoom);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
var bounds=[];
cfg.markers.forEach(function(m){
  var layer=m.approximate
    ? L.circle([m.lat,m.lng],{radius:900,color:'#008069',fillColor:'#25D366',fillOpacity:.25,weight:2})
    : L.marker([m.lat,m.lng]);
  layer.addTo(map).bindPopup(m.label+(m.approximate?'<br><small>Approximate area</small>':''));
  layer.on('click',function(){post({type:'marker',id:m.id})});
  bounds.push([m.lat,m.lng]);
});
if(bounds.length>1){map.fitBounds(bounds,{padding:[30,30]})}
if(cfg.pickable){
  var pin=L.marker([cfg.center.lat,cfg.center.lng],{draggable:true}).addTo(map);
  function pick(ll){pin.setLatLng(ll);post({type:'pick',lat:ll.lat,lng:ll.lng})}
  map.on('click',function(e){pick(e.latlng)});
  pin.on('dragend',function(){pick(pin.getLatLng())});
}
</script></body></html>`;
}
