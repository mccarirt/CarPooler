import type { LatLng, Pt } from '@/lib/geo';

export type MapStop = LatLng & { n: number; label: string; done?: boolean; current?: boolean };
export type MapProps = {
  stops: MapStop[];
  route: Pt[] | null;
  car: LatLng | null;
  routeColor?: string; // the driver's color
  carIcon?: string; // vehicle key, see lib/vehicles
};
