import { useEffect, useState } from 'react';
import { updateProfileEverywhere } from '@/lib/data';
import { useSession } from '@/lib/session';
import { Body, Button, ErrorNote, Field, Gap, leave, Screen, Title } from '@/components/ui';

export default function EditProfile() {
  const { profile } = useSession();
  const [name, setName] = useState('');
  const [car, setCar] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the form once, when the saved profile arrives.
  useEffect(() => {
    if (profile && !ready) {
      setName(profile.name);
      setCar(profile.car);
      setReady(true);
    }
  }, [profile, ready]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateProfileEverywhere(name, car);
      leave('/');
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
      <ErrorNote message={error} />
    </Screen>
  );
}
