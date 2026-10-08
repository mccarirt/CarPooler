import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { HouseholdDoc } from './data';
import { homeOf } from './places';
import { useSession } from './session';

export type Household = HouseholdDoc & { id: string };

// Your private household record: undefined while loading, null if you have none.
export function useHousehold() {
  const { uid } = useSession();
  const [household, setHousehold] = useState<Household | null | undefined>(undefined);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'households'), where('memberUids', 'array-contains', uid)),
      (snap) => setHousehold(snap.docs[0] ? { id: snap.docs[0].id, ...(snap.docs[0].data() as HouseholdDoc) } : null),
      () => setHousehold(null),
    );
  }, [uid]);
  return household;
}

// The home address to use: the household's shared one if there is one, otherwise your own saved home.
export function useHome() {
  const { profile } = useSession();
  const household = useHousehold();
  const mine = homeOf(profile?.places);
  return { home: household?.home ?? mine, shared: !!household?.home && household.memberUids.length > 1, household: household ?? null, loaded: household !== undefined };
}
