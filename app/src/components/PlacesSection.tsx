import { useState } from 'react';
import { View } from 'react-native';
import { Home, MapPin, X } from 'lucide-react-native';
import { Place, savePlaces } from '@/lib/data';
import { geocode } from '@/lib/geo';
import { homeOf, isHome } from '@/lib/places';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNote, Field, Heading, Small } from '@/components/ui';
import { Pressable } from 'react-native';
import { colors, space } from '@/theme';

// Places you use over and over. Save your home once, and every new ride fills it in for you.
export default function PlacesSection() {
  const { profile } = useSession();
  const places = profile?.places ?? [];
  const home = homeOf(places);
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState('');
  const [hit, setHit] = useState<{ lat: number; lng: number; display: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function saveHome() {
    if (!hit) return;
    setBusy(true);
    setError(null);
    try {
      const mine: Place = { label: 'Home', address: address.trim(), lat: hit.lat, lng: hit.lng };
      await savePlaces([mine, ...places.filter((p) => !isHome(p))]);
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
      <Small>Saved on your profile, so you never retype them. Only you can see this list. A place is copied onto a ride only when you use it there.</Small>

      {home && !editing ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Home size={22} color={colors.accent} strokeWidth={2.25} />
          <View style={{ flex: 1 }}>
            <Small style={{ color: colors.ink, fontWeight: '700' }}>Home</Small>
            <Small>{home.address}</Small>
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
              <Small style={{ color: colors.ok, fontWeight: '600' }}>{hit.display.split(',').slice(0, 3).join(',')} ✓</Small>
              <Button label="Save as home" loading={busy} onPress={saveHome} />
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
