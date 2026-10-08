import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Bus, Car, Circle, Truck } from 'lucide-react-native';
import { VEHICLES } from '@/lib/vehicles';
import { updateProfileEverywhere } from '@/lib/data';
import { colorFor } from '@/lib/palette';
import { useSession } from '@/lib/session';
import { Avatar, Body, Button, ColorPicker, ErrorNote, Field, Gap, Heading, leave, Screen, Small, Title } from '@/components/ui';
import { colors, space } from '@/theme';

export default function EditProfile() {
  const { profile, uid } = useSession();
  const [name, setName] = useState('');
  const [car, setCar] = useState('');
  const [color, setColor] = useState('');
  const [icon, setIcon] = useState('dot');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the form once, when the saved profile arrives.
  useEffect(() => {
    if (profile && uid && !ready) {
      setName(profile.name);
      setCar(profile.car);
      setColor(colorFor(uid, profile.color).key);
      setIcon(profile.icon ?? 'dot');
      setReady(true);
    }
  }, [profile, uid, ready]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateProfileEverywhere(name, car, color, icon !== (profile?.icon ?? 'dot') ? icon : undefined);
      leave('/me');
    } catch {
      setError('Could not save. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <Screen back footer={<Button label="Save" onPress={save} loading={busy} disabled={!name.trim() || !ready} />}>
      <Title>Your details</Title>
      <Body soft>Other parents see these in every circle you are in. Changes show up for everyone right away.</Body>
      <Gap size="sm" />
      <Field label="Your name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" />
      <Field label="Your car" hint="Kids spot it faster in the pickup line." value={car} onChangeText={setCar} placeholder="Silver Honda Pilot" />
      <View style={{ gap: space.sm }}>
        <Heading>Your color</Heading>
        <Small>It marks you on every ride card, so the family can tell at a glance who is driving.</Small>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={name || '?'} size={56} id={uid ?? 'x'} colorKey={color} />
          <View style={{ flex: 1 }}>
            <ColorPicker value={color} onChange={setColor} />
          </View>
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <Heading>Your car on the map</Heading>
        <Small>Shown in your color when you drive, and the route line takes your color too.</Small>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {VEHICLES.map((v) => {
            const on = v.key === icon;
            const Glyph = { dot: Circle, car: Car, van: Bus, truck: Truck }[v.key as 'dot'] ?? Circle;
            return (
              <Pressable
                key={v.key}
                accessibilityRole="button"
                accessibilityLabel={v.label}
                accessibilityState={{ selected: on }}
                onPress={() => setIcon(v.key)}
                style={{ flex: 1, minHeight: 72, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 3, borderColor: on ? colors.ink : colors.line, backgroundColor: colors.surface }}
              >
                <Glyph size={26} color={colorFor(uid ?? 'x', color).fg} strokeWidth={2.25} />
                <Small style={{ fontSize: 12, color: colors.ink, fontWeight: on ? '700' : '500' }}>{v.label}</Small>
              </Pressable>
            );
          })}
        </View>
      </View>
      <ErrorNote message={error} />
    </Screen>
  );
}
