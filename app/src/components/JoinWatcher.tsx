import { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { router } from 'expo-router';
import { db } from '@/lib/firebase';
import { JoinRequest, joinCircle } from '@/lib/data';
import { claimJoin, releaseJoin, removePendingJoin, usePendingJoins } from '@/lib/pendingJoins';
import { useSession } from '@/lib/session';

// App-wide, like the location sharer. Watches every circle this phone has asked to join, and finishes the
// join the moment an organizer approves, wherever the person happens to be in the app.
export default function JoinWatcher() {
  const { uid } = useSession();
  const pending = usePendingJoins();
  const key = pending.map((p) => p.circleId + ':' + p.code).join('|');

  useEffect(() => {
    if (!uid || pending.length === 0) return;
    const offs = pending.map((p) =>
      onSnapshot(
        doc(db, 'circles', p.circleId, 'requests', uid),
        async (snap) => {
          const req = snap.exists() ? (snap.data() as JoinRequest) : null;
          if (!req || req.status !== 'approved') return;
          if (!claimJoin(p.circleId)) return;
          try {
            const id = await joinCircle(p.code, { name: req.name, car: req.car, ...(req.color ? { color: req.color } : {}), ...(req.icon ? { icon: req.icon } : {}) });
            removePendingJoin(p.circleId);
            router.replace(`/circle/${id}`);
          } catch {
            releaseJoin(p.circleId); // try again on the next change or the next time the app opens
          }
        },
        () => {},
      ),
    );
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key]);

  return null;
}
