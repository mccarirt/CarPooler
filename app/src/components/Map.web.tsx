import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { colors, mode } from '@/theme';
import { vehicleFor } from '@/lib/vehicles';
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
      display:flex;align-items:center;justify-content:center;font:800 14px 'Hanken Grotesk',system-ui,sans-serif;box-sizing:border-box}
    .cc-pin.current{background:${colors.accent};border-color:${colors.accent};color:${colors.onAccent};transform:scale(1.15)}
    .cc-pin.done{background:${colors.ink};color:${colors.onInk};opacity:.55}
    .cc-car{width:28px;height:28px;border-radius:14px;border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);box-sizing:border-box}
    .cc-car.v{width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center}
    ${mode === 'dark' ? '.leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) saturate(.45) sepia(.35) brightness(.78) contrast(.92)}' : '.leaflet-tile-pane{filter:saturate(.65) sepia(.18) brightness(1.03)}'}
  `;
  document.head.appendChild(style);
}

export default function Map({ stops, route, car, routeColor, carIcon }: MapProps) {
  const tint = routeColor ?? colors.accent;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const carMarker = useRef<L.Marker | null>(null);
  const fitted = useRef('');
  const hasStops = useRef(false);
  const zooming = useRef(false);
  const iconKey = useRef('');
  const glide = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    injectStyles();
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([39.5, -98.35], 4);
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // While the map is being zoomed, the car must jump with it rather than glide.
    m.on('zoomstart', () => {
      zooming.current = true;
      clearTimeout(glide.current);
      const icon = carMarker.current?.getElement();
      if (icon) icon.style.transition = '';
    });
    m.on('zoomend', () => (zooming.current = false));
    // Leaflet only draws as much as it was last told it has. When the box changes size (the sheet
    // folding away, a phone turning), tell it, or the new space stays blank.
    const watcher = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => m.invalidateSize()) : null;
    watcher?.observe(el.current);
    return () => {
      watcher?.disconnect();
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
      L.polyline(route, { color: mode === 'dark' ? '#000' : colors.ink, weight: 7, opacity: mode === 'dark' ? 0.4 : 0.12 }).addTo(g);
      L.polyline(route, { color: tint, weight: 5, opacity: 0.95 }).addTo(g);
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
  }, [stops, route, tint]);

  // Moving driver marker.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!car) {
      carMarker.current?.remove();
      carMarker.current = null;
      return;
    }
    const v = vehicleFor(carIcon);
    const size = v.svg ? 40 : 28;
    const icon = L.divIcon({
      className: 'cc-car-wrap',
      html: `<div class="cc-car${v.svg ? ' v' : ''}" style="background:${tint}">${v.svg ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${v.svg}</svg>` : ''}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    const look = tint + '|' + v.key;
    const changed = iconKey.current !== look;
    if (!carMarker.current) {
      carMarker.current = L.marker([car.lat, car.lng], {
        icon,
        zIndexOffset: 1000,
        title: 'Driver',
      }).addTo(m);
    } else {
      // Glide to the new GPS point, but only for this move. A standing transition also animates the
      // re-positioning Leaflet does after a pinch-zoom, which made the car slide across the map.
      if (changed) carMarker.current.setIcon(icon);
      const el2 = carMarker.current.getElement();
      if (el2 && !zooming.current) {
        el2.style.transition = 'transform 1.1s linear';
        clearTimeout(glide.current);
        glide.current = setTimeout(() => (el2.style.transition = ''), 1200);
      }
      carMarker.current.setLatLng([car.lat, car.lng]);
    }
    iconKey.current = look;
    // Nothing pinned to frame the view? Follow the car so it is always on screen.
    if (!hasStops.current) m.setView([car.lat, car.lng], Math.max(m.getZoom(), 15), { animate: true });
  }, [car, tint, carIcon]);

  // zIndex 0 boxes the map's own layers in, so nothing on top of it (the back button) gets covered.
  return <div ref={el} style={{ position: 'absolute', inset: 0, zIndex: 0, background: colors.sunk }} />;
}
