import { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';
import { Circle, Kid, Member } from './data';
import { Days, DayInfo, Leg, Override, Overrides, resolveRotation } from './schedule';
import type { Run } from './ride';
import type { Broadcast, Swap } from './social';

export type KidRow = Kid & { id: string };

const PARTS = ['members', 'kids', 'legs', 'overrides', 'days', 'runs', 'swaps'] as const;

// One live subscription to everything a circle screen needs. `ready` turns true once every part has
// answered at least once (even with nothing in it), so a screen can tell "no rides today" from "still loading".
export function useCircle(id: string) {
  const [circle, setCircle] = useState<Circle | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [kids, setKids] = useState<KidRow[]>([]);
  const [legs, setLegs] = useState<Record<string, Leg>>({});
  const [overrides, setOverrides] = useState<Overrides>({});
  const [days, setDays] = useState<Days>({});
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [swaps, setSwaps] = useState<Record<string, Swap>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoaded({});
    const mark = (k: string) => setLoaded((l) => (l[k] ? l : { ...l, [k]: true }));
    const fail = (k: string) => () => mark(k); // a part we cannot read counts as answered, so a screen never waits forever
    const unsubs = [
      onSnapshot(doc(db, 'circles', id), (s) => setCircle(s.exists() ? (s.data() as Circle) : null), () => setCircle(null)),
      onSnapshot(collection(db, 'circles', id, 'members'), (s) => { setMembers(s.docs.map((d) => d.data() as Member)); mark('members'); }, fail('members')),
      onSnapshot(collection(db, 'circles', id, 'kids'), (s) => { setKids(s.docs.map((d) => ({ id: d.id, ...(d.data() as Kid) }))); mark('kids'); }, fail('kids')),
      onSnapshot(collection(db, 'circles', id, 'legs'), (s) => { setLegs(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Leg]))); mark('legs'); }, fail('legs')),
      onSnapshot(collection(db, 'circles', id, 'instances'), (s) => { setOverrides(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Override]))); mark('overrides'); }, fail('overrides')),
      onSnapshot(collection(db, 'circles', id, 'days'), (s) => { setDays(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as DayInfo]))); mark('days'); }, fail('days')),
      onSnapshot(collection(db, 'circles', id, 'runs'), (s) => { setRuns(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Run]))); mark('runs'); }, fail('runs')),
      onSnapshot(query(collection(db, 'circles', id, 'broadcasts'), orderBy('createdAt', 'desc'), limit(40)), (s) => setBroadcasts(s.docs.map((d) => d.data() as Broadcast)), () => {}),
      onSnapshot(collection(db, 'circles', id, 'swaps'), (s) => { setSwaps(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Swap]))); mark('swaps'); }, fail('swaps')),
    ];
    return () => unsubs.forEach((u) => u());
  }, [id]);

  const ready = circle !== undefined && PARTS.every((k) => loaded[k]);

  const rotation = useMemo(
    () => resolveRotation(circle?.rotation, members.map((m) => m.uid)),
    [circle?.rotation, members],
  );
  const nameOf = (uid: string | null) => members.find((m) => m.uid === uid)?.name ?? 'Unassigned';

  return { circle, members, kids, legs, overrides, days, runs, broadcasts, swaps, rotation, nameOf, ready };
}
