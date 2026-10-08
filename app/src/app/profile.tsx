import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { updateProfileEverywhere } from '@/lib/data';
import { colorFor } from '@/lib/palette';
import { useSession } from '@/lib/session';
import { Avatar, Body, Button, ColorPicker, ErrorNote, Field, Gap, Heading, leave, Screen, Small, Title } from '@/components/ui';
import { space } from '@/theme';

export default function EditProfile() {
  const { profile, uid } = useSession();
  const [name, setName] = useState('');
  const [car, setCar] = useState('');
  const [color, setColor] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the form once, when the saved profile arrives.
  useEffect(() => {
    if (profile && uid && !ready) {
      setName(profile.name);
      setCar(profile.car);
      setColor(colorFor(uid, profile.color).key);
      setReady(true);
    }
  }, [profile, uid, ready]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateProfileEverywhere(name, car, color);
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
      <ErrorNote message={error} />
    </Screen>
  );
}
