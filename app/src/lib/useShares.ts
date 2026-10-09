import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { ShareDoc } from './data';

// Who in a circle is sharing their location right now (ones that have run out of time are left out).
export function useShares(circleId: string, enabled = true) {
  const [rows, setRows] = useState<ShareDoc[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(db, 'circles', circleId, 'shares'),
      (snap) => setRows(snap.docs.map((d) => d.data() as ShareDoc)),
      () => setRows([]),
    );
  }, [circleId, enabled]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 20000); // the minutes left, and a share that just ran out
    return () => clearInterval(t);
  }, []);
  return rows.filter((r) => r.expiresAt > Date.now());
}

export const minutesLeft = (s: ShareDoc) => Math.max(1, Math.ceil((s.expiresAt - Date.now()) / 60000));
