import { useState } from 'react';
import { router } from 'expo-router';
import { createCircle } from '@/lib/data';
import { useSession } from '@/lib/session';
import { Body, Button, ErrorNote, Field, Gap, Screen, Title } from '@/components/ui';

export default function NewCircle() {
  const { profile } = useSession();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createCircle(name, profile);
      router.replace(`/circle/${id}`);
    } catch {
      setError('Could not create the circle. Try again in a moment.');
      setBusy(false);
    }
  }

  return (
    <Screen back footer={<Button label="Create circle" onPress={create} loading={busy} disabled={!name.trim() || !profile} />}>
      <Title>Name your circle</Title>
      <Body soft>One circle per carpool group. You can be in as many as you need, and each keeps its own schedule.</Body>
      <Gap size="sm" />
      <Field label="Circle name" value={name} onChangeText={setName} placeholder="Lincoln Elementary" autoCapitalize="words" maxLength={40} />
      <ErrorNote message={error} />
    </Screen>
  );
}
