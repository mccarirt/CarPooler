import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ensureRealtimeAccess, publishPosition } from '@/lib/data';
import { gpsDebug } from '@/lib/gpsDebug';
import type { Run } from '@/lib/ride';
import { useMemberships } from '@/lib/useMemberships';
import { useSession } from '@/lib/session';

type Active = { circleId: string; key: string };

// Shares this phone's location for every real (not demo) ride you are driving that is in progress.
// It lives at the top of the app, so it keeps going if the driver moves to another screen. It also asks
// the browser to keep the screen awake while a ride is live, because a web page can only read location
// while it is open on screen. Nothing runs when you are not driving a ride that has started.
export default function LocationSharer() {
  const { uid } = useSession();
  const rows = useMemberships();
  const [active, setActive] = useState<Record<string, Active>>({});

  // Which of my rides are in progress right now?
  const circleIds = rows?.map((r) => r.id).join(',') ?? '';
  useEffect(() => {
    if (!uid || !circleIds) return;
    const offs = circleIds.split(',').map((circleId) =>
      onSnapshot(
        query(collection(db, 'circles', circleId, 'runs'), where('driverUid', '==', uid), where('status', '==', 'started')),
        (snap) =>
          setActive((a) => {
            const next = { ...a };
            for (const k of Object.keys(next)) if (next[k].circleId === circleId) delete next[k];
            snap.docs.forEach((d) => {
              if (!(d.data() as Run).simulated) next[circleId + '/' + d.id] = { circleId, key: d.id };
            });
            return next;
          }),
        () => {},
      ),
    );
    return () => offs.forEach((o) => o());
  }, [uid, circleIds]);

  const list = Object.values(active);
  const signature = list.map((x) => x.circleId + '/' + x.key).join('|');
  const latest = useRef<Active[]>([]);
  latest.current = list;

  useEffect(() => {
    if (!uid || list.length === 0 || Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      gpsDebug.geo = 'this browser cannot share location';
      return;
    }
    let alive = true;
    let last = 0;
    gpsDebug.watching = true;
    gpsDebug.geo = 'waiting for a location fix (the browser may be asking permission)';

    // Make sure this phone is registered to write the live position, once per circle.
    const ready = Promise.all(
      [...new Set(list.map((x) => x.circleId))].map(async (circleId) => {
        const code = ((await getDoc(doc(db, 'circles', circleId))).data() as { inviteCode?: string } | undefined)?.inviteCode;
        if (code) await ensureRealtimeAccess(circleId, code, false);
      }),
    ).catch(() => {});

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        gpsDebug.geo = 'getting location, accurate to ' + Math.round(pos.coords.accuracy) + ' m';
        gpsDebug.lastFixAt = Date.now();
        if (Date.now() - last < 3000) return;
        last = Date.now();
        ready.then(() => {
          if (!alive) return;
          for (const a of latest.current)
            publishPosition(a.circleId, a.key, uid, pos.coords.latitude, pos.coords.longitude, false)
              .then(() => {
                gpsDebug.publish = 'sent OK';
                gpsDebug.lastSentAt = Date.now();
              })
              .catch((e: unknown) => {
                gpsDebug.publish = 'FAILED to send: ' + (e instanceof Error ? e.message : String(e));
              });
        });
      },
      (err) => {
        gpsDebug.geo = 'location blocked or unavailable (code ' + err.code + '): ' + err.message;
      },
      { enableHighAccuracy: true, maximumAge: 2000 },
    );

    // Keep the screen from dimming and locking while a ride is live (where the browser allows it).
    type Lock = { release: () => Promise<void> };
    let lock: Lock | null = null;
    const wake = async () => {
      try {
        const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Lock> } };
        if (nav.wakeLock && document.visibilityState === 'visible') lock = await nav.wakeLock.request('screen');
      } catch {
        // Not allowed here; the driver just needs to keep the screen on.
      }
    };
    wake();
    const onVisible = () => {
      if (document.visibilityState === 'visible') wake();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      gpsDebug.watching = false;
      navigator.geolocation.clearWatch(watch);
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, signature]);

  return null;
}
