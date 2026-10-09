import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { HouseholdDoc } from './data';
import { homeOf } from './places';
import { useSession } from './session';

export type Household = HouseholdDoc & { id: string };

// Your private household record: undefined while loading, null if you have none.
export function useHousehold() {
  const { uid, profile } = useSession();
  const [household, setHousehold] = useState<Household | null | undefined>(undefined);
  // Anyone can list anyone in a household record, so only one made of you and the people YOU listed counts.
  const trusted = (profile?.household ?? []).join(',');
  useEffect(() => {
    if (!uid) return;
    const allowed = new Set([uid, ...trusted.split(',').filter(Boolean)]);
    return onSnapshot(
      query(collection(db, 'households'), where('memberUids', 'array-contains', uid)),
      (snap) => {
        const ok = snap.docs.find((d) => (d.data() as HouseholdDoc).memberUids.every((u) => allowed.has(u)));
        setHousehold(ok ? { id: ok.id, ...(ok.data() as HouseholdDoc) } : null);
      },
      () => setHousehold(null),
    );
  }, [uid, trusted]);
  return household;
}

// The home address to use: the household's shared one if there is one, otherwise your own saved home.
export function useHome() {
  const { profile } = useSession();
  const household = useHousehold();
  const mine = homeOf(profile?.places);
  return { home: household?.home ?? mine, shared: !!household?.home && household.memberUids.length > 1, household: household ?? null, loaded: household !== undefined };
}
