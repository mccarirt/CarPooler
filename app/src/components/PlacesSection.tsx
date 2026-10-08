import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Check, Home, MapPin, X } from 'lucide-react-native';
import { Place, saveHome, savePlaces, syncHousehold } from '@/lib/data';
import { useHome } from '@/lib/useHousehold';
import { geocode } from '@/lib/geo';
import { isHome } from '@/lib/places';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNote, Field, Heading, Small } from '@/components/ui';
import { Pressable } from 'react-native';
import { colors, space } from '@/theme';

// Places you use over and over. Save your home once, and every new ride fills it in for you.
export default function PlacesSection() {
  const { profile } = useSession();
  const places = profile?.places ?? [];
  const { home, shared, household, loaded } = useHome();
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState('');
  const [hit, setHit] = useState<{ lat: number; lng: number; display: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const healed = useRef(false);

  // If you listed people in your household before households were shared, create the shared record now,
  // and carry your saved home into it, so your partner gets it without you doing anything.
  useEffect(() => {
    if (!loaded || healed.current) return;
    const needsRecord = !household && (profile?.household?.length ?? 0) > 0;
    const needsHome = !!household && !household.home && places.some(isHome);
    if (needsRecord || needsHome) {
      healed.current = true;
      syncHousehold(needsRecord ? profile!.household! : [], []).catch(() => {});
    }
  }, [loaded, household, profile?.household, places]);

  async function find() {
    setBusy(true);
    setError(null);
    setHit(null);
    try {
      const h = await geocode(address);
      if (h) setHit(h);
      else setError('We could not find that address. Try adding the city and state.');
    } catch {
      setError('The address lookup is not responding. Try again in a moment.');
    }
    setBusy(false);
  }

  async function commitHome() {
    if (!hit) return;
    setBusy(true);
    setError(null);
    try {
      const mine: Place = { label: 'Home', address: address.trim(), lat: hit.lat, lng: hit.lng };
      await saveHome(mine, household);
      setEditing(false);
      setAddress('');
      setHit(null);
    } catch {
      setError('Could not save that. Try again in a moment.');
    }
    setBusy(false);
  }

  const others = places.filter((p) => !isHome(p));

  return (
    <Card style={{ gap: space.sm }}>
      <Heading>Your places</Heading>
      <Small>Saved so you never retype them. Your home is shared with your household and nobody else. A place is copied onto a ride only when you use it there.</Small>

      {home && !editing ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Home size={22} color={colors.accent} strokeWidth={2.25} />
          <View style={{ flex: 1 }}>
            <Small style={{ color: colors.ink, fontWeight: '700' }}>Home</Small>
            <Small>{home.address}</Small>
            {shared && <Small style={{ color: colors.ok, fontWeight: '600' }}>Shared with your household</Small>}
          </View>
          <Pressable accessibilityRole="button" onPress={() => { setEditing(true); setAddress(home.address); }} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Small style={{ color: colors.accent, fontWeight: '700' }}>Change</Small>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          <Field label="Home address" value={address} onChangeText={(v) => { setAddress(v); setHit(null); }} placeholder="123 Maple St, Charlotte NC" />
          {address.trim() && !hit && <Button variant="secondary" label="Find on map" loading={busy} onPress={find} />}
          {hit && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Check size={16} color={colors.ok} strokeWidth={3} />
                <Small style={{ color: colors.ok, fontWeight: '600', flex: 1 }}>{hit.display.split(',').slice(0, 3).join(',')}</Small>
              </View>
              <Button label="Save as home" loading={busy} onPress={commitHome} />
            </>
          )}
          {home && <Button variant="ghost" label="Cancel" onPress={() => { setEditing(false); setHit(null); setError(null); }} />}
          <ErrorNote message={error} />
        </View>
      )}

      {others.map((p) => (
        <View key={`${p.label}_${p.lat}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <MapPin size={22} color={colors.inkSoft} strokeWidth={2.25} />
          <View style={{ flex: 1 }}>
            <Small style={{ color: colors.ink, fontWeight: '700' }}>{p.label}</Small>
            <Small>{p.address}</Small>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${p.label}`} onPress={() => savePlaces(places.filter((x) => x !== p))} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} color={colors.inkSoft} />
          </Pressable>
        </View>
      ))}
    </Card>
  );
}
