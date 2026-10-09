import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { JoinRequest } from './data';

// The people waiting to be let into a circle. Only the circle's starter may read these.
export function usePendingRequests(circleId: string, enabled: boolean) {
  const [rows, setRows] = useState<JoinRequest[]>([]);
  useEffect(() => {
    if (!enabled) return setRows([]);
    return onSnapshot(
      query(collection(db, 'circles', circleId, 'requests'), where('status', '==', 'pending')),
      (snap) => setRows(snap.docs.map((d) => d.data() as JoinRequest).sort((a, b) => a.createdAt - b.createdAt)),
      () => setRows([]),
    );
  }, [circleId, enabled]);
  return rows;
}

// My own ask to join one circle: undefined while loading, null if I have not asked.
export function useMyRequest(circleId: string | undefined, uid: string | null) {
  const [req, setReq] = useState<JoinRequest | null | undefined>(undefined);
  useEffect(() => {
    setReq(undefined); // a different person means a different answer: wait for it
    if (!circleId || !uid) return;
    return onSnapshot(
      doc(db, 'circles', circleId, 'requests', uid),
      (snap) => setReq(snap.exists() ? (snap.data() as JoinRequest) : null),
      () => setReq(null),
    );
  }, [circleId, uid]);
  return req;
}
