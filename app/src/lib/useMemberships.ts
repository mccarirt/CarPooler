import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Membership } from './data';
import { useSession } from './session';

export type MembershipRow = Membership & { id: string };

// Every circle the signed-in person belongs to, with whether it has been archived. A circle's archived
// flag lives on the circle itself (members cannot write each other's lists), so each circle is watched.
// `null` while loading. A row waits for its circle's answer, so an archived circle never flashes by.
function useAllMemberships() {
  const { uid } = useSession();
  const [rows, setRows] = useState<MembershipRow[] | null>(null);
  const [archived, setArchived] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(db, 'users', uid, 'memberships'),
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Membership) }))),
      () => setRows([]),
    );
  }, [uid]);

  const ids = (rows ?? []).map((r) => r.id).join(',');
  useEffect(() => {
    if (!ids) return;
    const offs = ids.split(',').map((id) =>
      onSnapshot(
        doc(db, 'circles', id),
        (snap) => setArchived((a) => ({ ...a, [id]: !!(snap.data() as { archived?: boolean } | undefined)?.archived })),
        () => setArchived((a) => ({ ...a, [id]: false })), // cannot read it: leave it listed
      ),
    );
    return () => offs.forEach((o) => o());
  }, [ids]);

  return useMemo(() => ({ rows, archived }), [rows, archived]);
}

// The circles to show: everything not archived. `null` while loading.
export function useMemberships() {
  const { rows, archived } = useAllMemberships();
  return useMemo(() => {
    if (rows === null) return null;
    if (rows.some((r) => archived[r.id] === undefined)) return null; // still checking each circle
    return rows.filter((r) => !archived[r.id]);
  }, [rows, archived]);
}

// Circles the person started that are archived, so they can bring one back.
export function useArchivedCircles() {
  const { rows, archived } = useAllMemberships();
  return useMemo(() => (rows ?? []).filter((r) => r.role === 'admin' && archived[r.id]), [rows, archived]);
}
