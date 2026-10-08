// Structured one-tap messages ("broadcasts") and swap requests. Pure types + text helpers.
// Deliberately not chat: every message is one of a fixed set of kinds (brief §5i).

export type BroadcastType =
  | 'running_late'
  | 'ride_started'
  | 'arriving'
  | 'picked_up'
  | 'dropped_off'
  | 'ride_completed'
  | 'swap_requested'
  | 'swap_accepted';

export type Broadcast = {
  type: BroadcastType;
  fromUid: string;
  fromName: string;
  legId: string;
  legLabel: string; // e.g. "Our Household — Baseball practice · Dropoff"
  date: string;
  createdAt: number;
  kidName?: string;
  stopLabel?: string;
  minutes?: number;
};

export type Swap = {
  legId: string;
  date: string;
  legLabel: string;
  start: string; // 'HH:MM', for display
  requesterUid: string;
  requesterName: string;
  status: 'open' | 'accepted' | 'cancelled';
  createdAt: number;
  acceptedByUid?: string;
  acceptedByName?: string;
  acceptedAt?: number;
};

const first = (name: string) => name.split(' ')[0];

export function broadcastText(b: Broadcast) {
  const who = first(b.fromName);
  switch (b.type) {
    case 'running_late':
      return `${who} is running ${b.minutes ?? 10} min late`;
    case 'ride_started':
      return `${who} started the ride`;
    case 'arriving':
      return `${who} is arriving at ${b.stopLabel ?? 'the next stop'}`;
    case 'picked_up':
      return `${b.kidName ?? 'A child'} was picked up by ${who}`;
    case 'dropped_off':
      return `${b.kidName ?? 'A child'} was dropped off`;
    case 'ride_completed':
      return `${who} finished the ride`;
    case 'swap_requested':
      return `${who} needs a sub`;
    case 'swap_accepted':
      return `${who} will drive`;
  }
}

export function timeAgo(ms: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}
