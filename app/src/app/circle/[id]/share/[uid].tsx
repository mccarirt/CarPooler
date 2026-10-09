import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { onValue, ref } from 'firebase/database';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db, rtdb } from '@/lib/firebase';
import { ensureRealtimeAccess, livePath, shareKey, stopShare } from '@/lib/data';
import type { Live } from '@/lib/ride';
import { colorFor } from '@/lib/palette';
import { minutesLeft, useShares } from '@/lib/useShares';
import { useSession } from '@/lib/session';
import Map from '@/components/Map';
import { Avatar, Body, Button, Centered, Heading, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';

// Watching someone's shared location: just the map and who, for how long, and how fresh the position is.
export default function WatchShare() {
  const { id, uid: sharer } = useLocalSearchParams<{ id: string; uid: string }>();
  const { uid: me } = useSession();
  const shares = useShares(id);
  const share = shares.find((s) => s.uid === sharer);
  const [live, setLive] = useState<Live | null | undefined>(undefined);
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState(false); // give the share a moment to arrive before saying it has ended
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let off = () => {};
    let alive = true;
    (async () => {
      try {
        const circle = (await getDoc(doc(db, 'circles', id))).data() as { inviteCode?: string; adminUid?: string } | undefined;
        if (circle?.inviteCode) await ensureRealtimeAccess(id, circle.inviteCode, false);
      } catch {
        // Already registered, or offline; the listener below still tries.
      }
      if (!alive) return;
      off = onValue(ref(rtdb, livePath(id, shareKey(sharer))), (s) => setLive(s.val() as Live | null), () => setLive(null));
    })();
    const t = setInterval(() => tick((n) => n + 1), 20000);
    return () => {
      alive = false;
      off();
      clearInterval(t);
    };
  }, [id, sharer]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const age = live ? Math.max(0, Math.round((Date.now() - live.ts) / 1000)) : null;
  const note =
    !share ? null : live === null ? "Waiting for their location. Their phone may be offline or have location turned off." : age !== null && age > 60 ? `Last location ${age < 120 ? age + ' seconds' : Math.round(age / 60) + ' minutes'} ago. They may have lost signal, so this may not be where they are now.` : null;

  if (!share && !settled)
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, minHeight: 220 }}>
        <Map stops={[]} route={null} car={share && live ? { lat: live.lat, lng: live.lng } : null} routeColor={colorFor(sharer, share?.color).fg} carIcon={share?.icon} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={back}
          style={{ position: 'absolute', zIndex: 10, top: space.md, left: space.md, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
        >
          <ChevronLeft size={26} color={colors.ink} strokeWidth={2.25} />
        </Pressable>
      </View>
      <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -24, padding: space.md, gap: space.sm, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: -4 } }}>
        {share ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Avatar name={share.name} size={48} id={share.uid} colorKey={share.color} />
              <View style={{ flex: 1 }}>
                <Heading>{share.uid === me ? 'You are sharing' : share.name.split(' ')[0] + ' is sharing'}</Heading>
                <Small>{(share.note ? share.note + ' · ' : '') + minutesLeft(share) + ' min left'}</Small>
              </View>
            </View>
            {note && <Small style={{ color: colors.warnFg, fontWeight: '600' }}>{note}</Small>}
            {share.uid === me && (
              <Button
                label="Stop sharing"
                loading={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    await stopShare(id);
                    back();
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          </>
        ) : (
          <>
            <Heading>This share has ended</Heading>
            <Body soft>{'The sharing time is up, or ' + 'they stopped it. Nothing is kept after it ends.'}</Body>
            <Button variant="secondary" label="Back" onPress={back} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
