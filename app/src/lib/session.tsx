import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Profile } from './data';

type Session = { uid: string | null; profile: Profile | null; loading: boolean };
const Ctx = createContext<Session>({ uid: null, profile: null, loading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Session>({ uid: null, profile: null, loading: true });

  useEffect(() => {
    let unsubProfile = () => {};
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubProfile();
      if (!user) {
        setState({ uid: null, profile: null, loading: false });
        return;
      }
      unsubProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) =>
          setState({ uid: user.uid, profile: snap.exists() ? (snap.data() as Profile) : null, loading: false }),
        () => setState({ uid: user.uid, profile: null, loading: false }),
      );
    });
    return () => {
      unsubProfile();
      unsubAuth();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
