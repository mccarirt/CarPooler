import { useState } from 'react';
import { saveProfile } from '@/lib/data';
import { Body, Button, Display, ErrorNote, Field, Gap, Screen } from '@/components/ui';

// First screen for someone with no profile yet. No tab bar here: there is nothing to navigate to.
export default function Welcome() {
  const [name, setName] = useState('');
  const [car, setCar] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await saveProfile(name, car);
    } catch {
      setError('Could not get you set up. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <Screen footer={<Button label="Continue" onPress={go} loading={busy} disabled={!name.trim()} />}>
      <Gap size="xl" />
      <Display>Share the drive. Skip the group-text scramble.</Display>
      <Body soft>
        Carpool Circle keeps your school and practice runs organized: who drives, when, and that every kid got where
        they were going.
      </Body>
      <Gap size="sm" />
      <Field label="Your name" value={name} onChangeText={setName} placeholder="Dana Whitfield" autoCapitalize="words" autoComplete="name" />
      <Field label="Your car (optional)" hint="Kids spot it faster in the pickup line." value={car} onChangeText={setCar} placeholder="Blue Odyssey" />
      <ErrorNote message={error} />
    </Screen>
  );
}
