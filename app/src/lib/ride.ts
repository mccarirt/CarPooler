// Ride-day state machine helpers. Pure: no Firebase, no React.
import type { Stop } from './schedule';

export type KidState = 'waiting' | 'picked_up' | 'dropped_off' | 'absent'; // absent = did not ride this time
export type Run = {
  driverUid: string;
  status: 'started' | 'completed';
  stopIndex: number; // the stop the driver is heading to / at
  arrived: boolean;
  kids: Record<string, KidState>;
  simulated: boolean;
  startedAt?: number;
  arrivingStop?: number; // last stop we announced "arriving" for
  completedAt?: number;
};
export type Live = { driverUid: string; lat: number; lng: number; ts: number; sim?: boolean };

export const PHASES = ['Scheduled', 'Driver started', 'En route', 'Arriving', 'Picked up', 'Dropped off'] as const;

// The stop that is the destination: school in the morning, school (first stop) in the afternoon.
export const destinationIndex = (direction: 'AM' | 'PM', stops: Stop[]) => (direction === 'AM' ? stops.length - 1 : 0);

export function kidIdsOf(stops: Stop[]) {
  return [...new Set(stops.flatMap((s) => s.kidIds))];
}

// Where a child gets on (morning) or off (afternoon): the first stop that is not the destination and
// lists them. If they are only ticked at the destination, or nowhere useful, fall back to the far end of
// the ride so the ride still works. A one-stop ride has no home end (null).
export function homeStopOf(direction: 'AM' | 'PM', stops: Stop[], kidId: string): number | null {
  const dest = destinationIndex(direction, stops);
  const listed = stops.findIndex((s, i) => i !== dest && s.kidIds.includes(kidId));
  if (listed >= 0) return listed;
  const far = direction === 'AM' ? 0 : stops.length - 1;
  return far !== dest ? far : null;
}

// What can the driver confirm right now, per kid?
export function kidActions(direction: 'AM' | 'PM', stops: Stop[], run: Run): Record<string, { to: KidState; label: string }> {
  const out: Record<string, { to: KidState; label: string }> = {};
  if (run.status !== 'started') return out;
  const dest = destinationIndex(direction, stops);
  const here = run.stopIndex;
  for (const kidId of kidIdsOf(stops)) {
    const state = run.kids[kidId] ?? 'waiting';
    const home = homeStopOf(direction, stops, kidId);
    if (direction === 'AM') {
      // Dropped off at the destination (also straight away on a one-stop ride, where there is no pickup).
      if (here === dest && (state === 'picked_up' || (home === null && state === 'waiting'))) out[kidId] = { to: 'dropped_off', label: 'Dropped off' };
      else if (here === home && state === 'waiting') out[kidId] = { to: 'picked_up', label: 'Picked up' };
    } else {
      if (here === dest && state === 'waiting') out[kidId] = { to: 'picked_up', label: 'Picked up' };
      else if (here === home && state === 'picked_up') out[kidId] = { to: 'dropped_off', label: 'Dropped off' };
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

export type Primary = { kind: 'start' | 'confirm' | 'leave' | 'complete' | 'done'; label: string };

const firstName = (n: string) => n.split(' ')[0];
function nameList(names: string[]) {
  if (names.length === 1) return firstName(names[0]);
  if (names.length === 2) return `${firstName(names[0])} and ${firstName(names[1])}`;
  return `${names.length} kids`;
}

// The one big button for the driver, evolving with state. When children are waiting at the
// current stop it IS the confirmation ("Picked up Leia"), so there is no separate "I'm here".
export function primaryAction(
  run: Run | undefined,
  stops: Stop[],
  pending: Record<string, { to: KidState; label: string }>,
  nameOf: (kidId: string) => string,
): Primary {
  if (!run) return { kind: 'start', label: 'Start leg' };
  if (run.status === 'completed') return { kind: 'done', label: 'Leg complete' };
  const ids = Object.keys(pending);
  if (ids.length > 0) return { kind: 'confirm', label: `${pending[ids[0]].label} ${nameList(ids.map(nameOf))}` };
  if (run.stopIndex === stops.length - 1) return { kind: 'complete', label: 'Complete leg' };
  return { kind: 'leave', label: `Leave ${stops[run.stopIndex].label}` };
}

// What to write after confirming `updates`: the next stop once everyone there is dealt with, or
// the end of the ride after the last stop. Returns null when nothing should move on yet.
export function afterConfirm(
  direction: 'AM' | 'PM',
  stops: Stop[],
  run: Run,
  updates: Record<string, KidState>,
): 'next' | 'complete' | null {
  const moved: Run = { ...run, kids: { ...run.kids, ...updates } };
  if (Object.keys(kidActions(direction, stops, moved)).length > 0) return null;
  return run.stopIndex === stops.length - 1 ? 'complete' : 'next';
}

