import type { Place } from './data';

export const isHome = (p: Place) => p.label.trim().toLowerCase() === 'home';
export const homeOf = (places: Place[] | undefined) => places?.find(isHome);

// The same spot if the coordinates are within about 25 metres.
export const samePlace = (a: { lat?: number; lng?: number }, b: { lat?: number; lng?: number }) =>
  a.lat !== undefined && a.lng !== undefined && b.lat !== undefined && b.lng !== undefined && Math.abs(a.lat - b.lat) < 0.00025 && Math.abs(a.lng - b.lng) < 0.00025;
