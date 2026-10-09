import { useEffect, useState } from 'react';

// Circles this phone has asked to join and is waiting on. Kept on this phone so that joining can finish by
// itself the moment an organizer approves, wherever the person is in the app, even if they closed the waiting page.
export type PendingJoin = { circleId: string; code: string; circleName: string };
const KEY = 'cc.pendingJoins';
const EVENT = 'cc-pending-joins';

export function readPendingJoins(): PendingJoin[] {
  try {
    return JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) || '[]');
  } catch {
    return [];
  }
}

function write(list: PendingJoin[]) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: joining still finishes if the person stays on the waiting page.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function addPendingJoin(p: PendingJoin) {
  write([...readPendingJoins().filter((x) => x.circleId !== p.circleId), p]);
}

export function removePendingJoin(circleId: string) {
  write(readPendingJoins().filter((x) => x.circleId !== circleId));
}

export function usePendingJoins() {
  const [list, setList] = useState<PendingJoin[]>(() => readPendingJoins());
  useEffect(() => {
    const on = () => setList(readPendingJoins());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return list;
}

// Only one place at a time may finish a given join (the waiting page and the app-wide watcher both can).
const claimed = new Set<string>();
export const claimJoin = (circleId: string) => (claimed.has(circleId) ? false : (claimed.add(circleId), true));
export const releaseJoin = (circleId: string) => void claimed.delete(circleId);
