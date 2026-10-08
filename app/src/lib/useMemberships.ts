import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Membership } from './data';
import { useSession } from './session';

export type MembershipRow = Membership & { id: string };

// The circles the signed-in person belongs to. `null` while loading.
export function useMemberships() {
  const { uid } = useSession();
  const [rows, setRows] = useState<MembershipRow[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(db, 'users', uid, 'memberships'),
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Membership) }))),
      () => setRows([]),
    );
  }, [uid]);

  return rows;
}
