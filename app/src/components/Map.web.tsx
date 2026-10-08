import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { colors } from '@/theme';
import type { MapProps } from './mapTypes';

// Standard OpenStreetMap tiles: free, no key (fine for light prototype use; revisit before a wide launch).
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; OpenStreetMap contributors';

let styled = false;
function injectStyles() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  document.head.appendChild(link);
  const style = document.createElement('style');
  style.textContent = `
    .cc-pin{width:32px;height:32px;border-radius:16px;background:${colors.surface};color:${colors.ink};border:3px solid ${colors.ink};
      display:flex;align-items:center;justify-content:center;font:800 14px system-ui,sans-serif;box-sizing:border-box}
    .cc-pin.current{background:${colors.accent};border-color:${colors.accent};color:#fff;transform:scale(1.15)}
    .cc-pin.done{background:${colors.ink};color:#fff;opacity:.55}
    .cc-car{width:28px;height:28px;border-radius:14px;background:${colors.accent};border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);box-sizing:border-box}
    .leaflet-tile-pane{filter:saturate(.65) sepia(.18) brightness(1.03)}
    .leaflet-marker-icon.cc-car-wrap{transition:transform 1.1s linear}
    .leaflet-zoom-anim .leaflet-marker-icon.cc-car-wrap{transition:none}
  `;
  document.head.appendChild(style);
}

export default function Map({ stops, route, car }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const carMarker = useRef<L.Marker | null>(null);
  const fitted = useRef('');
  const hasStops = useRef(false);

  useEffect(() => {
    injectStyles();
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([39.5, -98.35], 4);
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // Stops and route.
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    hasStops.current = stops.length > 0;
    if (route && route.length > 1) {
      L.polyline(route, { color: colors.ink, weight: 7, opacity: 0.12 }).addTo(g);
      L.polyline(route, { color: colors.accent, weight: 5, opacity: 0.95 }).addTo(g);
    }
    stops.forEach((s) => {
      const cls = s.current ? 'cc-pin current' : s.done ? 'cc-pin done' : 'cc-pin';
      L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: '', html: `<div class="${cls}">${s.n}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] }),
        title: s.label,
      }).addTo(g);
    });
    const key = stops.map((s) => `${s.lat},${s.lng}`).join('|');
    if (stops.length && fitted.current !== key) {
      fitted.current = key;
      const pts: L.LatLngExpression[] = route && route.length > 1 ? route : stops.map((s) => [s.lat, s.lng]);
      m.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 16 });
    }
  }, [stops, route]);

  // Moving driver marker.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!car) {
      carMarker.current?.remove();
      carMarker.current = null;
      return;
    }
    if (!carMarker.current) {
      carMarker.current = L.marker([car.lat, car.lng], {
        icon: L.divIcon({ className: 'cc-car-wrap', html: '<div class="cc-car"></div>', iconSize: [28, 28], iconAnchor: [14, 14] }),
        zIndexOffset: 1000,
        title: 'Driver',
      }).addTo(m);
    } else {
      carMarker.current.setLatLng([car.lat, car.lng]);
    }
    // Nothing pinned to frame the view? Follow the car so it is always on screen.
    if (!hasStops.current) m.setView([car.lat, car.lng], Math.max(m.getZoom(), 15), { animate: true });
  }, [car]);

  return <div ref={el} style={{ position: 'absolute', inset: 0, background: colors.sunk }} />;
}
