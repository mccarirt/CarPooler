// Ride-day state machine helpers. Pure: no Firebase, no React.
import type { Stop } from './schedule';

export type KidState = 'waiting' | 'picked_up' | 'dropped_off';
export type Run = {
  driverUid: string;
  status: 'started' | 'completed';
  stopIndex: number; // the stop the driver is heading to / at
  arrived: boolean;
  kids: Record<string, KidState>;
  simulated: boolean;
  startedAt?: number;
  completedAt?: number;
};
export type Live = { driverUid: string; lat: number; lng: number; ts: number; sim?: boolean };

export const PHASES = ['Scheduled', 'Driver started', 'En route', 'Arriving', 'Picked up', 'Dropped off'] as const;

// The stop that is the destination: school in the morning, school (first stop) in the afternoon.
export const destinationIndex = (direction: 'AM' | 'PM', stops: Stop[]) => (direction === 'AM' ? stops.length - 1 : 0);

export function kidIdsOf(stops: Stop[]) {
  return [...new Set(stops.flatMap((s) => s.kidIds))];
}

// What can the driver confirm right now, per kid?
export function kidActions(direction: 'AM' | 'PM', stops: Stop[], run: Run): Record<string, { to: KidState; label: string }> {
  const out: Record<string, { to: KidState; label: string }> = {};
  if (run.status !== 'started' || !run.arrived) return out;
  const dest = destinationIndex(direction, stops);
  const here = run.stopIndex;
  for (const kidId of kidIdsOf(stops)) {
    const state = run.kids[kidId] ?? 'waiting';
    if (direction === 'AM') {
      if (here === dest && state === 'picked_up') out[kidId] = { to: 'dropped_off', label: 'Dropped off' };
      else if (here !== dest && stops[here].kidIds.includes(kidId) && state === 'waiting') out[kidId] = { to: 'picked_up', label: 'Picked up' };
    } else {
      if (here === dest && state === 'waiting') out[kidId] = { to: 'picked_up', label: 'Picked up' };
      else if (here !== dest && stops[here].kidIds.includes(kidId) && state === 'picked_up') out[kidId] = { to: 'dropped_off', label: 'Dropped off' };
    }
  }
  return out;
}

// Which of the six rideshare-style states are we in? Returns an index into PHASES.
export function phaseOf(run: Run | undefined, kidIds: string[], hasPosition: boolean, nearNextStop: boolean) {
  if (!run) return 0;
  if (run.status === 'completed') return 5;
  const states = kidIds.map((k) => run.kids[k] ?? 'waiting');
  if (kidIds.length > 0 && states.every((s) => s !== 'waiting')) return 4;
  if (nearNextStop && !run.arrived) return 3;
  if (hasPosition) return 2;
  return 1;
}

export function initialKids(kidIds: string[]): Record<string, KidState> {
  return Object.fromEntries(kidIds.map((k) => [k, 'waiting' as KidState]));
}

// Primary-button label for the driver, evolving with state.
export function primaryLabel(run: Run | undefined, stops: Stop[]) {
  if (!run) return 'Start leg';
  if (run.status === 'completed') return 'Leg complete';
  const stop = stops[run.stopIndex];
  if (!run.arrived) return `I'm here at ${stop.label}`;
  return run.stopIndex === stops.length - 1 ? 'Complete leg' : `Leave ${stop.label}`;
}
