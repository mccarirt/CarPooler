import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

// The circle's current name, live. The copy kept on each person's own list can go stale when the
// organizer renames the circle, so lists read the name from the circle itself and use the saved copy
// only until it arrives (or if the circle can't be read).
export function useCircleName(circleId: string, fallback: string) {
  const [name, setName] = useState(fallback);
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'circles', circleId),
        (s) => s.exists() && setName((s.data() as { name?: string }).name ?? fallback),
        () => {},
      ),
    [circleId, fallback],
  );
  return name;
}
