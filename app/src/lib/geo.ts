// Map math + free OpenStreetMap services (Nominatim geocoding, OSRM routing).
// Pure helpers first; network helpers at the bottom.

export type LatLng = { lat: number; lng: number };
export type Pt = [number, number]; // [lat, lng]

export function haversine(a: LatLng, b: LatLng) {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const ll = (p: Pt): LatLng => ({ lat: p[0], lng: p[1] });

// Cumulative metres along the polyline at each vertex.
export function cumulative(coords: Pt[]) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(ll(coords[i - 1]), ll(coords[i])));
  return cum;
}

// Closest vertex at or after index `from`.
export function nearestIndex(coords: Pt[], p: LatLng, from = 0) {
  let best = from;
  let bestD = Infinity;
  for (let i = from; i < coords.length; i++) {
    const d = haversine(ll(coords[i]), p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Position `d` metres along the polyline.
export function pointAt(coords: Pt[], cum: number[], d: number): LatLng {
  if (d <= 0) return ll(coords[0]);
  const total = cum[cum.length - 1];
  if (d >= total) return ll(coords[coords.length - 1]);
  let i = 1;
  while (cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / seg;
  return {
    lat: coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
    lng: coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
  };
}

export function fmtDistance(m: number) {
  const miles = m / 1609.34;
  if (miles < 0.1) return `${Math.max(10, Math.round((m * 3.281) / 10) * 10)} ft`;
  return `${miles.toFixed(1)} mi`;
}

// ---------- network ----------
export type Route = {
  coords: Pt[];
  cum: number[];
  totalDist: number; // metres
  totalDur: number; // seconds
  stopIdx: number[]; // polyline vertex index for each input stop
};

const geocodeCache = new Map<string, { lat: number; lng: number; display: string } | null>();
export async function geocode(query: string) {
  const q = query.trim();
  if (!q) return null;
  if (geocodeCache.has(q)) return geocodeCache.get(q)!;
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('geocode failed');
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  const hit = rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon), display: rows[0].display_name } : null;
  geocodeCache.set(q, hit);
  return hit;
}

const routeCache = new Map<string, Route | null>();
export async function fetchRoute(points: LatLng[]): Promise<Route | null> {
  if (points.length < 2) return null;
  const key = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  if (routeCache.has(key)) return routeCache.get(key)!;
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson`);
    const json = await res.json();
    const r = json.routes?.[0];
    if (!r) throw new Error('no route');
    const coords: Pt[] = r.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
    const cum = cumulative(coords);
    const stopIdx: number[] = [];
    let from = 0;
    for (const p of points) {
      const i = nearestIndex(coords, p, from);
      stopIdx.push(i);
      from = i;
    }
    const route: Route = { coords, cum, totalDist: r.distance, totalDur: r.duration, stopIdx };
    routeCache.set(key, route);
    return route;
  } catch {
    routeCache.set(key, null);
    return null;
  }
}
