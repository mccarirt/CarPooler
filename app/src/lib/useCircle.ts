import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Circle, Kid, Member } from './data';
import { Days, DayInfo, Leg, Override, Overrides, resolveRotation } from './schedule';

export type KidRow = Kid & { id: string };

// One live subscription to everything a circle screen needs.
export function useCircle(id: string) {
  const [circle, setCircle] = useState<Circle | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [kids, setKids] = useState<KidRow[]>([]);
  const [legs, setLegs] = useState<Record<string, Leg>>({});
  const [overrides, setOverrides] = useState<Overrides>({});
  const [days, setDays] = useState<Days>({});

  useEffect(() => {
    const noop = () => {};
    const unsubs = [
      onSnapshot(doc(db, 'circles', id), (s) => setCircle(s.exists() ? (s.data() as Circle) : null), () => setCircle(null)),
      onSnapshot(collection(db, 'circles', id, 'members'), (s) => setMembers(s.docs.map((d) => d.data() as Member)), noop),
      onSnapshot(collection(db, 'circles', id, 'kids'), (s) => setKids(s.docs.map((d) => ({ id: d.id, ...(d.data() as Kid) }))), noop),
      onSnapshot(collection(db, 'circles', id, 'legs'), (s) => setLegs(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Leg]))), noop),
      onSnapshot(collection(db, 'circles', id, 'instances'), (s) => setOverrides(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Override]))), noop),
      onSnapshot(collection(db, 'circles', id, 'days'), (s) => setDays(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as DayInfo]))), noop),
    ];
    return () => unsubs.forEach((u) => u());
  }, [id]);

  const rotation = useMemo(
    () => resolveRotation(circle?.rotation, members.map((m) => m.uid)),
    [circle?.rotation, members],
  );
  const nameOf = (uid: string | null) => members.find((m) => m.uid === uid)?.name ?? 'Unassigned';

  return { circle, members, kids, legs, overrides, days, rotation, nameOf };
}
